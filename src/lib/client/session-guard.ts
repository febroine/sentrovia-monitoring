// A 401 from the app's own API means the session has ended (expired, signed out elsewhere, password
// changed, or the account was removed). Pages would otherwise show "Unauthorized" with a retry that
// cannot work, so the app says so once and offers to sign in again.

// These answer 401 for a wrong password, not for an ended session.
const CREDENTIAL_CHECK_PATHS = ["/api/auth/login", "/api/auth/change-password", "/api/auth/onboarding"];

export const SESSION_ENDED_NOTICE = "session-ended";

// Set when the user signs out or removes their own account on purpose: the requests that fail on the
// way to the sign-in page are expected and must not replace that page's own message.
let intentionalSignOut = false;

export function markIntentionalSignOut() {
  intentionalSignOut = true;
}

export function isSessionEndedResponse(requestUrl: string, status: number, origin: string) {
  if (status !== 401) return false;
  let url: URL;
  try {
    url = new URL(requestUrl, origin);
  } catch {
    return false;
  }
  return url.origin === origin
    && url.pathname.startsWith("/api/")
    && !CREDENTIAL_CHECK_PATHS.includes(url.pathname);
}

export function buildSessionEndedLoginPath(currentPath: string) {
  const next = currentPath.startsWith("/") && !currentPath.startsWith("//") ? currentPath : "/dashboard";
  return `/login?next=${encodeURIComponent(next)}&message=${SESSION_ENDED_NOTICE}`;
}

// Wraps window.fetch so any API answer of 401 calls onSessionEnded once. Returns the cleanup.
export function installSessionGuard(onSessionEnded: () => void) {
  const originalFetch = window.fetch;
  let notified = false;
  // A new guard belongs to a new signed-in page; an earlier sign-out no longer applies.
  intentionalSignOut = false;
  const guardedFetch: typeof window.fetch = async (input, init) => {
    const response = await originalFetch(input, init);
    const requestUrl = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!notified && !intentionalSignOut && isSessionEndedResponse(requestUrl, response.status, window.location.origin)) {
      notified = true;
      onSessionEnded();
    }
    return response;
  };
  window.fetch = guardedFetch;
  return () => {
    if (window.fetch === guardedFetch) window.fetch = originalFetch;
  };
}
