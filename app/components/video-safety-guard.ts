export type ViolationCategory =
  | "none"
  | "sexual"
  | "drugs"
  | "violence"
  | "terror"
  | "weapons"
  | "child_safety"
  | "alcohol_tobacco";

export interface VideoSafetyViolation {
  category: ViolationCategory;
  confidence: number;
  reason?: string;
}

export type SafetyViolationCallback = (violation: VideoSafetyViolation) => void;

/**
 * Heurística de alta velocidade para detecção de exposição anômala (Camada 1 no Navegador)
 * Analisa a proporção de tons de pele humana versus vestuário/cenário
 */
export function analyzeLocalFrameForExposure(imageData: ImageData): {
  skinRatio: number;
  isSuspicious: boolean;
} {
  const data = imageData.data;
  const totalPixels = data.length / 4;
  let skinPixels = 0;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    // Modelo RGB calibrado para diversidade de tons de pele
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);

    if (
      r > 95 &&
      g > 40 &&
      b > 20 &&
      max - min > 15 &&
      Math.abs(r - g) > 15 &&
      r > g &&
      r > b
    ) {
      skinPixels++;
    }
  }

  const skinRatio = skinPixels / totalPixels;
  // Limiar ajustado para 35%: se mais de 35% do frame for composto por pele, aciona auditoria prioritária
  const isSuspicious = skinRatio > 0.35;

  return { skinRatio, isSuspicious };
}

/**
 * Calcula a variação média de luminância entre o quadro atual e o último avaliado (Smart Frame Diffing)
 * Evita chamadas redundantes ao Gemini quando a câmera está filmando um cenário estático.
 */
function calculateFrameDifference(currentLuma: Uint8Array, previousLuma: Uint8Array | null): number {
  if (!previousLuma || previousLuma.length !== currentLuma.length) return 1.0;

  let totalDiff = 0;
  for (let i = 0; i < currentLuma.length; i++) {
    totalDiff += Math.abs(currentLuma[i] - previousLuma[i]);
  }

  return totalDiff / (currentLuma.length * 255);
}

/**
 * Guarda de Segurança e Moderação em Tempo Real de Vídeo (VideoSafetyGuard)
 * Atua com amostragem inteligente, Smart Frame Diffing e corte imediato de hardware.
 */
export class VideoSafetyGuard {
  private videoElement: HTMLVideoElement | null = null;
  private stream: MediaStream | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;

  // Canvas auxiliar 32x32 para Smart Frame Diffing
  private diffCanvas: HTMLCanvasElement | null = null;
  private diffCtx: CanvasRenderingContext2D | null = null;
  private lastEvaluatedLuma: Uint8Array | null = null;

  private timer: ReturnType<typeof setInterval> | null = null;
  private isCheckingServer = false;
  private lastServerCheckTime = 0;
  private onViolation: SafetyViolationCallback;
  private isDestroyed = false;

  constructor(onViolation: SafetyViolationCallback) {
    this.onViolation = onViolation;
    if (typeof document !== "undefined") {
      // Canvas principal 256x256 para auditoria de visão multimodal nítida
      this.canvas = document.createElement("canvas");
      this.canvas.width = 256;
      this.canvas.height = 256;
      this.ctx = this.canvas.getContext("2d", { willReadFrequently: true });

      // Canvas 32x32 para diffing ultrarrápido
      this.diffCanvas = document.createElement("canvas");
      this.diffCanvas.width = 32;
      this.diffCanvas.height = 32;
      this.diffCtx = this.diffCanvas.getContext("2d", { willReadFrequently: true });
    }
  }

  /**
   * Vincula a MediaStream ativa para permitir encerramento de hardware imediato em caso de violação
   */
  attachStream(stream: MediaStream | null) {
    this.stream = stream;
  }

  /**
   * Desliga imediatamente todos os tracks da câmera no nível do hardware do dispositivo
   */
  stopHardware() {
    if (this.stream) {
      try {
        this.stream.getTracks().forEach((track) => {
          track.stop();
          track.enabled = false;
        });
      } catch (err) {
        console.warn("Erro ao desligar tracks de hardware:", err);
      }
    }

    if (this.videoElement && this.videoElement.srcObject) {
      try {
        const stream = this.videoElement.srcObject as MediaStream;
        stream.getTracks().forEach((track) => {
          track.stop();
          track.enabled = false;
        });
        this.videoElement.srcObject = null;
      } catch {}
    }
  }

  /**
   * Inicia o monitoramento contínuo sobre o elemento de vídeo alvo
   */
  start(video: HTMLVideoElement, stream?: MediaStream | null) {
    this.stop();
    this.videoElement = video;
    if (stream) {
      this.attachStream(stream);
    }
    this.isDestroyed = false;
    this.lastEvaluatedLuma = null;

    // Loop a cada 500ms para responsividade imediata
    this.timer = setInterval(() => {
      this.tick();
    }, 500);
  }

  private async tick() {
    if (this.isDestroyed || !this.videoElement || !this.canvas || !this.ctx) return;
    if (this.videoElement.readyState < 2 || this.videoElement.paused) return;

    try {
      // 1. Amostra frame 256x256
      this.ctx.drawImage(this.videoElement, 0, 0, 256, 256);
      const imageData = this.ctx.getImageData(0, 0, 256, 256);

      // 2. Camada 1: Heurística Local de Pele
      const { skinRatio, isSuspicious } = analyzeLocalFrameForExposure(imageData);

      // 3. Smart Frame Diffing (32x32)
      let frameDelta = 1.0;
      let currentLuma: Uint8Array | null = null;
      if (this.diffCanvas && this.diffCtx) {
        this.diffCtx.drawImage(this.videoElement, 0, 0, 32, 32);
        const diffData = this.diffCtx.getImageData(0, 0, 32, 32).data;
        currentLuma = new Uint8Array(32 * 32);
        for (let i = 0, j = 0; i < diffData.length; i += 4, j++) {
          // Fórmula de luminância padrão ITU-R BT.601
          currentLuma[j] = Math.round(diffData[i] * 0.299 + diffData[i + 1] * 0.587 + diffData[i + 2] * 0.114);
        }
        frameDelta = calculateFrameDifference(currentLuma, this.lastEvaluatedLuma);
      }

      const now = Date.now();
      const timeSinceLastServer = now - this.lastServerCheckTime;

      // Política de amostragem inteligente:
      // A) Se pele > 35%: Prioridade Máxima imediata (mínimo 800ms entre requisições)
      // B) Se houve movimento/mudança na cena (delta > 4%): Auditoria a cada 2.5s
      // C) Se a cena está estática (delta <= 4% e sem pele): Suspende e audita apenas a cada 8s
      const isSceneChanged = frameDelta > 0.04;
      const shouldCheckServer =
        (isSuspicious && timeSinceLastServer >= 800) ||
        (isSceneChanged && timeSinceLastServer >= 2500) ||
        timeSinceLastServer >= 8000;

      if (shouldCheckServer && !this.isCheckingServer) {
        if (currentLuma) {
          this.lastEvaluatedLuma = currentLuma;
        }
        await this.verifyFrameOnServer();
      }
    } catch {
      // Ignora erro de captura momentânea
    }
  }

  private async verifyFrameOnServer() {
    if (!this.canvas || this.isCheckingServer || this.isDestroyed) return;

    this.isCheckingServer = true;
    this.lastServerCheckTime = Date.now();

    try {
      // Qualidade JPEG 0.75 em 256x256 garante alta nitidez visual para o Gemini
      const imageBase64 = this.canvas.toDataURL("image/jpeg", 0.75);

      const res = await fetch("/api/moderation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64 }),
      });

      if (!res.ok) {
        this.isCheckingServer = false;
        return;
      }

      const data = await res.json();

      if (data && data.safe === false) {
        // 🚨 VIOLAÇÃO DETECTADA! Corta o hardware imediatamente e aciona o callback
        this.stopHardware();

        this.onViolation({
          category: data.violationType || "sexual",
          confidence: data.confidence || 0.95,
          reason: data.reason || "Conteúdo impróprio detectado no fluxo de vídeo.",
        });
      }
    } catch {
      // Falha transitória de rede não derruba a chamada de imediato
    } finally {
      this.isCheckingServer = false;
    }
  }

  /**
   * Interrompe o monitoramento e libera recursos
   */
  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.videoElement = null;
    this.isDestroyed = true;
    this.lastEvaluatedLuma = null;
  }
}
