import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { OnboardingFlow } from "@/app/onboarding/onboarding-flow";
import { getSession } from "@/lib/auth/session";
import { isOnboardingRequired } from "@/lib/auth/service";

// Sign-in and setup screens carry no content worth a search result.
export const metadata: Metadata = {
  title: "Set up",
  robots: { index: false, follow: true },
};

export default async function OnboardingPage() {
  if (await isOnboardingRequired()) {
    return <OnboardingFlow />;
  }

  const session = await getSession();
  redirect(session ? "/" : "/login");
}
