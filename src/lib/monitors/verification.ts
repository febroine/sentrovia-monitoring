const VERIFICATION_TIMEOUT_STEP_RATIO = 0.5;
const MAX_VERIFICATION_TIMEOUT_MULTIPLIER = 2;
const MAX_VERIFICATION_TIMEOUT_MS = 120_000;
const FINAL_CONFIRMATION_PROBE_COUNT = 2;

export function calculateVerificationTimeout(baseTimeoutMs: number, verificationAttempt: number) {
  if (verificationAttempt <= 0) {
    return baseTimeoutMs;
  }

  const multiplier = Math.min(
    MAX_VERIFICATION_TIMEOUT_MULTIPLIER,
    1 + verificationAttempt * VERIFICATION_TIMEOUT_STEP_RATIO
  );

  return Math.min(MAX_VERIFICATION_TIMEOUT_MS, Math.round(baseTimeoutMs * multiplier));
}

export function calculateVerificationLeaseBudgetMs(baseTimeoutMs: number) {
  return calculateVerificationTimeout(baseTimeoutMs, Number.MAX_SAFE_INTEGER)
    * FINAL_CONFIRMATION_PROBE_COUNT;
}
