const DEFAULT_AUTH_REDIRECT_PATH = "/dashboard";

export function resolveSafeAuthRedirect(value: string | null | undefined) {
  if (!value) {
    return DEFAULT_AUTH_REDIRECT_PATH;
  }

  const trimmed = value.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//") || /[\\\r\n\t]/.test(trimmed)) {
    return DEFAULT_AUTH_REDIRECT_PATH;
  }

  return trimmed;
}
