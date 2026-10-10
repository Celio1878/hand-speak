// Freemium & Quota Management Service
export const FREE_DAILY_CREDITS = 15;
export const PRO_PRICE_BRL = "R$ 9,90";

const STORAGE_KEYS = {
  CREDITS: "handspeak_gemini_credits",
  LAST_DATE: "handspeak_last_credit_date",
  IS_PRO: "handspeak_is_pro",
  BYOK_KEY: "handspeak_custom_api_key",
  MODEL: "handspeak_selected_model",
  TONE: "handspeak_selected_tone",
};

function getTodayString(): string {
  return new Date().toISOString().split("T")[0];
}

export function getRemainingCredits(): number {
  if (typeof window === "undefined") return FREE_DAILY_CREDITS;
  if (isProUser() || Boolean(getCustomApiKey())) return 999;

  const today = getTodayString();
  const lastDate = localStorage.getItem(STORAGE_KEYS.LAST_DATE);

  if (lastDate !== today) {
    // Reset for new day
    localStorage.setItem(STORAGE_KEYS.LAST_DATE, today);
    localStorage.setItem(STORAGE_KEYS.CREDITS, String(FREE_DAILY_CREDITS));
    return FREE_DAILY_CREDITS;
  }

  const stored = localStorage.getItem(STORAGE_KEYS.CREDITS);
  return stored !== null ? Math.max(0, parseInt(stored, 10)) : FREE_DAILY_CREDITS;
}

export function useCredit(): boolean {
  if (typeof window === "undefined") return true;
  if (isProUser() || Boolean(getCustomApiKey())) return true;

  const current = getRemainingCredits();
  if (current <= 0) return false;

  const next = current - 1;
  localStorage.setItem(STORAGE_KEYS.CREDITS, String(next));
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
  if (typeof window === "undefined") return "";
  return localStorage.getItem(STORAGE_KEYS.BYOK_KEY) || "";
}

export function setCustomApiKey(key: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEYS.BYOK_KEY, key.trim());
}

export function getSelectedModel(): string {
  if (typeof window === "undefined") return "gemini-3.8-flash";
  return localStorage.getItem(STORAGE_KEYS.MODEL) || "gemini-3.8-flash";
}

export function setSelectedModel(model: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEYS.MODEL, model);
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
