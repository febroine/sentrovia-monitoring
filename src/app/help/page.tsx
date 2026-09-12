import { HelpWorkspacePage } from "@/components/help/help-workspace-page";
import { PublicHelpPage } from "@/components/public/public-help-page";
import { getSession } from "@/lib/auth/session";

export default async function HelpPage() {
  const session = await getSession();
  return session ? <HelpWorkspacePage /> : <PublicHelpPage />;
}
