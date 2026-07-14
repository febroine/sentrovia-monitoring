export const TOAST_EVENT = "sentrovia:toast";

export type ToastTone = "success" | "error" | "info";

export type ToastPayload = {
  message: string;
  tone?: ToastTone;
};

export function showToast(message: string, tone: ToastTone = "info") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<ToastPayload>(TOAST_EVENT, { detail: { message, tone } }));
}
