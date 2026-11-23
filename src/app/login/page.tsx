import { redirect } from "next/navigation";
import { LoginForm } from "@/app/login/login-form";
import { getSession } from "@/lib/auth/session";
import type { Metadata } from "next";
import { isOnboardingRequired } from "@/lib/auth/service";

// Explanations for why someone was sent to the sign-in page.
const LOGIN_NOTICES: Record<string, string> = {
  "account-removed": "Your account was removed from the workspace, so you were signed out.",
  "session-ended": "Your session has ended. Sign in again to continue where you left off.",
};

// Sign-in and setup screens carry no content worth a search result.
export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: true },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await getSession();
  if (session) {
    redirect("/");
  }

  if (await isOnboardingRequired()) {
    redirect("/onboarding");
  }

  const message = (await searchParams).message;
  const notice = typeof message === "string" ? LOGIN_NOTICES[message] ?? null : null;
  return <LoginForm notice={notice} />;
}
