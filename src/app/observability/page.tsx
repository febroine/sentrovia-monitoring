import { redirect } from "next/navigation";
import { WorkerObservabilityDashboard } from "@/components/monitoring/worker-observability-dashboard";
import { SystemStatus } from "@/components/system-status";
import { getSession } from "@/lib/auth/session";

export default async function ObservabilityPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Observability</h1>
        <p className="text-sm text-muted-foreground">
          Worker runtime pressure, cycle quality, failing monitors, and recent scheduler issues in one place.
        </p>
      </header>

      <SystemStatus />
      <WorkerObservabilityDashboard />
    </div>
  );
}
