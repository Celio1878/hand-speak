export type ViolationCategory =
  | "none"
  | "sexual"
  | "violence"
  | "terror"
  | "weapons"
  | "child_safety";

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

    // Modelo clássico de detecção de pele no espaço RGB
    // Regra: R > 95, G > 40, B > 20, max(R,G,B) - min(R,G,B) > 15, |R - G| > 15, R > G, R > B
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
  // Se mais de 65% do frame total for composto por tons corporais sem roupa/cenário, gera suspeita para auditoria imediata
  const isSuspicious = skinRatio > 0.65;

  return { skinRatio, isSuspicious };
}

/**
 * Guarda de Segurança e Moderação em Tempo Real de Vídeo (VideoSafetyGuard)
 */
export class VideoSafetyGuard {
  private videoElement: HTMLVideoElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private isCheckingServer = false;
  private lastServerCheckTime = 0;
  private onViolation: SafetyViolationCallback;
  private isDestroyed = false;

  constructor(onViolation: SafetyViolationCallback) {
    this.onViolation = onViolation;
    if (typeof document !== "undefined") {
      this.canvas = document.createElement("canvas");
      this.canvas.width = 128;
      this.canvas.height = 128;
      this.ctx = this.canvas.getContext("2d", { willReadFrequently: true });
    }
  }

  /**
   * Inicia o monitoramento contínuo sobre o elemento de vídeo alvo
   */
  start(video: HTMLVideoElement) {
    this.stop();
    this.videoElement = video;
    this.isDestroyed = false;

    // Loop a cada 800ms
    this.timer = setInterval(() => {
      this.tick();
    }, 800);
  }

  private async tick() {
    if (this.isDestroyed || !this.videoElement || !this.canvas || !this.ctx) return;
    if (this.videoElement.readyState < 2 || this.videoElement.paused) return;

    try {
      this.ctx.drawImage(this.videoElement, 0, 0, 128, 128);
      const imageData = this.ctx.getImageData(0, 0, 128, 128);

      // 1. Camada 1: Heurística Local Instantânea
      const { isSuspicious } = analyzeLocalFrameForExposure(imageData);

      const now = Date.now();
      const timeSinceLastServer = now - this.lastServerCheckTime;

      // Dispara Camada 2 (servidor) a cada 5 segundos OU imediatamente se a camada local suspeitar
      const shouldCheckServer = isSuspicious || timeSinceLastServer >= 5000;

      if (shouldCheckServer && !this.isCheckingServer) {
        await this.verifyFrameOnServer();
      }
    } catch (err) {
      // Ignora erro de captura momentânea
    }
  }

  private async verifyFrameOnServer() {
    if (!this.canvas || this.isCheckingServer || this.isDestroyed) return;

    this.isCheckingServer = true;
    this.lastServerCheckTime = Date.now();

    try {
      const imageBase64 = this.canvas.toDataURL("image/jpeg", 0.55);

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
        // Violação detectada! Dispara o callback imediatamente
        this.onViolation({
          category: data.violationType || "violence",
          confidence: data.confidence || 0.9,
          reason: data.reason || "Conteúdo impróprio detectado no fluxo de vídeo.",
        });
      }
    } catch {
      // Falha de rede não derruba a chamada
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
  }
}
