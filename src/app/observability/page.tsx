import { redirect } from "next/navigation";
import { Activity, Clock3, Flame, Radar } from "lucide-react";
import { WorkerObservabilityDashboard } from "@/components/monitoring/worker-observability-dashboard";
import { Badge } from "@/components/ui/badge";
import { getSession } from "@/lib/auth/session";

export default async function ObservabilityPage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-3xl border border-border/70 bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.16),transparent_32%),radial-gradient(circle_at_top_right,rgba(251,191,36,0.10),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.03),transparent_22%)]">
        <div className="px-6 py-6 md:px-8 md:py-7">
          <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr] xl:items-start">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-300">
                  Runtime Lens
                </Badge>
                <Badge variant="outline" className="border-border/70 text-muted-foreground">
                  Worker telemetry
                </Badge>
              </div>

              <div className="space-y-2">
                <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Observability</h1>
                <p className="max-w-3xl text-sm leading-7 text-muted-foreground md:text-[15px]">
                  Read the worker like an operator would: backlog pressure, cycle health, failure concentration,
                  and runtime drift all surface here in one focused console.
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
              <HeroSignal
                icon={Radar}
                title="Backlog focus"
                detail="Watch due checks before queue pressure becomes user-visible."
              />
              <HeroSignal
                icon={Flame}
                title="Failure pressure"
                detail="Spot concentrated breakage across monitors without digging into logs first."
              />
              <HeroSignal
                icon={Clock3}
                title="Cycle rhythm"
                detail="Track scheduler pace and recent execution quality side by side."
              />
            </div>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-3">
            <AccentStrip
              icon={Activity}
              title="Worker-led execution"
              text="Checks, retries, verification, reminders, and recovery signals are all driven by the background runner."
            />
            <AccentStrip
              icon={Radar}
              title="Readable under load"
              text="This page is tuned to help you understand pressure quickly, not just confirm that a process is alive."
            />
            <AccentStrip
              icon={Flame}
              title="Failure context first"
              text="Failing monitors and worker-side issues stay visible so troubleshooting starts in the right place."
            />
          </div>
        </div>
      </section>

      <WorkerObservabilityDashboard />
    </div>
  );
}

function HeroSignal({
  icon: Icon,
  title,
  detail,
}: {
  icon: typeof Radar;
  title: string;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border border-border/70 bg-background/70 px-4 py-4">
      <div className="flex items-start gap-3">
        <div className="rounded-xl border border-border/70 bg-muted/15 p-2.5">
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-semibold tracking-tight">{title}</p>
          <p className="text-xs leading-6 text-muted-foreground">{detail}</p>
        </div>
      </div>
    </div>
  );
}

function AccentStrip({
  icon: Icon,
  title,
  text,
}: {
  icon: typeof Radar;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-2xl border border-border/70 bg-background/50 px-4 py-4">
      <div className="flex items-start gap-3">
        <div className="rounded-xl border border-border/70 bg-background p-2.5">
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="space-y-1.5">
          <p className="text-sm font-semibold">{title}</p>
          <p className="text-xs leading-6 text-muted-foreground">{text}</p>
        </div>
      </div>
    </div>
  );
}
