import { redirect } from "next/navigation";
import { LoginForm } from "@/app/login/login-form";
import { getSession } from "@/lib/auth/session";
import { isOnboardingRequired } from "@/lib/auth/service";

export default async function LoginPage() {
  const session = await getSession();
  if (session) {
    redirect("/");
  }

  if (await isOnboardingRequired()) {
    redirect("/onboarding");
  }

  return <LoginForm />;
}
