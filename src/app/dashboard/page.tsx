import { redirect } from "next/navigation";
import { DashboardLive } from "@/components/dashboard/dashboard-live";
import { getSession } from "@/lib/auth/session";
import { getDashboardData } from "@/lib/dashboard/service";

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const data = await getDashboardData(session.id);
  return <DashboardLive initialData={data} />;
}
