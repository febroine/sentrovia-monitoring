import { HelpWorkspacePage } from "@/components/help/help-workspace-page";
import { PublicHelpPage } from "@/components/public/public-help-page";
import type { Metadata } from "next";
import { PUBLIC_PAGES, publicPageMetadata } from "@/lib/seo/site";
import { getSession } from "@/lib/auth/session";

export const metadata: Metadata = publicPageMetadata(PUBLIC_PAGES[1]);

export default async function HelpPage() {
  const session = await getSession();
  return session ? <HelpWorkspacePage /> : <PublicHelpPage />;
}
