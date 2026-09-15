import { redirect } from "next/navigation";
import { OnboardingFlow } from "@/app/onboarding/onboarding-flow";
import { getSession } from "@/lib/auth/session";
import { isOnboardingRequired } from "@/lib/auth/service";

export default async function OnboardingPage() {
  if (await isOnboardingRequired()) {
    return <OnboardingFlow />;
  }

  const session = await getSession();
  redirect(session ? "/" : "/login");
}
