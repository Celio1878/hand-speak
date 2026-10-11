// Freemium & Quota Management Service
export const FREE_DAILY_CREDITS = 15;
export const FREE_DAILY_VIDEO_SECONDS = 300; // 5 minutos diários de vídeo gratuito
export const PRO_PRICE_BRL = "R$ 24,90";

const STORAGE_KEYS = {
  CREDITS: "handspeak_ai_credits",
  VIDEO_SECONDS: "handspeak_video_seconds_used",
  LAST_DATE: "handspeak_last_credit_date",
  IS_PRO: "handspeak_is_pro",
  MODEL: "handspeak_selected_model",
  TONE: "handspeak_selected_tone",
};

// Limpeza automática de chaves residuais legadas
if (typeof window !== "undefined") {
  try {
    localStorage.removeItem("handspeak_custom_api_key");
  } catch {
    // Ignora erro de storage
  }
}

function getTodayString(): string {
  return new Date().toISOString().split("T")[0];
}

export function getRemainingCredits(): number {
  if (typeof window === "undefined") return FREE_DAILY_CREDITS;
  if (isProUser()) return 999;

  const today = getTodayString();
  const lastDate = localStorage.getItem(STORAGE_KEYS.LAST_DATE);

  if (lastDate !== today) {
    // Renovação diária
    localStorage.setItem(STORAGE_KEYS.LAST_DATE, today);
    localStorage.setItem(STORAGE_KEYS.CREDITS, String(FREE_DAILY_CREDITS));
    localStorage.setItem(STORAGE_KEYS.VIDEO_SECONDS, "0");
    return FREE_DAILY_CREDITS;
  }

  const stored = localStorage.getItem(STORAGE_KEYS.CREDITS);
  return stored !== null ? Math.max(0, parseInt(stored, 10)) : FREE_DAILY_CREDITS;
}

export function useCredit(): boolean {
  if (typeof window === "undefined") return true;
  if (isProUser()) return true;

  const current = getRemainingCredits();
  if (current <= 0) return false;

  const next = current - 1;
  localStorage.setItem(STORAGE_KEYS.CREDITS, String(next));
  return true;
}

/**
 * Retorna os segundos restantes de vídeo permitidos no dia de hoje
 */
export function getRemainingVideoSeconds(): number {
  if (typeof window === "undefined") return FREE_DAILY_VIDEO_SECONDS;
  if (isProUser()) return 999999; // Ilimitado para assinantes Pro

  const today = getTodayString();
  const lastDate = localStorage.getItem(STORAGE_KEYS.LAST_DATE);

  if (lastDate !== today) {
    localStorage.setItem(STORAGE_KEYS.LAST_DATE, today);
    localStorage.setItem(STORAGE_KEYS.CREDITS, String(FREE_DAILY_CREDITS));
    localStorage.setItem(STORAGE_KEYS.VIDEO_SECONDS, "0");
    return FREE_DAILY_VIDEO_SECONDS;
  }

  const storedUsed = localStorage.getItem(STORAGE_KEYS.VIDEO_SECONDS);
  const used = storedUsed !== null ? parseInt(storedUsed, 10) : 0;
  return Math.max(0, FREE_DAILY_VIDEO_SECONDS - used);
}

/**
 * Registra o consumo de segundos de transmissão de vídeo
 */
export function consumeVideoSeconds(seconds: number): boolean {
  if (typeof window === "undefined") return true;
  if (isProUser()) return true;

  const remaining = getRemainingVideoSeconds();
  if (remaining <= 0) return false;

  const storedUsed = localStorage.getItem(STORAGE_KEYS.VIDEO_SECONDS);
  const currentUsed = storedUsed !== null ? parseInt(storedUsed, 10) : 0;
  const newUsed = currentUsed + seconds;

  localStorage.setItem(STORAGE_KEYS.VIDEO_SECONDS, String(newUsed));
  return true;
}

export function isProUser(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(STORAGE_KEYS.IS_PRO) === "true";
}

export function setProUser(status: boolean): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEYS.IS_PRO, String(status));
}

export function getCustomApiKey(): string {
  return "";
}

export function getSelectedModel(): string {
  return "gemini-3.8-flash";
}

export function getSelectedTone(): "casual" | "formal" | "emergency" {
  if (typeof window === "undefined") return "casual";
  const tone = localStorage.getItem(STORAGE_KEYS.TONE);
  if (tone === "formal" || tone === "emergency" || tone === "casual") return tone;
  return "casual";
}

export function setSelectedTone(tone: "casual" | "formal" | "emergency"): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEYS.TONE, tone);
}
