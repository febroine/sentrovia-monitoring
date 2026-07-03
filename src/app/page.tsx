import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { isOnboardingRequired } from "@/lib/auth/service";
import { getSettings } from "@/lib/settings/service";

export default async function RootPage() {
  const session = await getSession();
  if (!session) {
    if (await isOnboardingRequired()) {
      redirect("/onboarding");
    }

    redirect("/login");
  }

  const settings = await getSettings(session.id);
  const landingPage = settings?.appearance.dashboardLandingPage ?? "dashboard";
  redirect(`/${landingPage}`);
}
