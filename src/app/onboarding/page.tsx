"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  BellRing,
  CheckCircle2,
  Database,
  Eye,
  EyeOff,
  LoaderCircle,
  RadioTower,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SentroviaMark } from "@/components/brand/sentrovia-mark";
import { cn } from "@/lib/utils";

type OnboardingStep = "intro" | "form";

const inputClassName =
  "h-11 rounded-lg border-border/80 bg-surface-low/80 text-foreground placeholder:text-muted-foreground/70 focus-visible:border-primary/60 focus-visible:ring-primary/20";

const productSteps = [
  { icon: RadioTower, title: "Monitor", description: "Track websites, APIs, TCP, PostgreSQL, ping, and heartbeat jobs." },
  { icon: Activity, title: "Verify", description: "Confirm failures before the first outage message is sent." },
  { icon: BellRing, title: "Notify", description: "Send clear alerts with the reason, timing, and latest evidence." },
];

const setupItems = [
  { icon: ShieldCheck, label: "Administrator", value: "First account" },
  { icon: UsersRound, label: "Members", value: "Admin-managed" },
  { icon: ShieldCheck, label: "Access", value: "Admin-controlled" },
  { icon: Database, label: "Storage", value: "PostgreSQL" },
];

export default function OnboardingPage() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [step, setStep] = useState<OnboardingStep>("intro");
  const [ready, setReady] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [isNavigating, startTransition] = useTransition();
  const busy = submitting || isNavigating;

  useEffect(() => {
    let active = true;

    void fetch("/api/auth/onboarding", { cache: "no-store" })
      .then(async (response) =>
        handleReadinessResponse(response, () => active, (href) => router.replace(href), setReady, setError)
      )
      .catch(() => {
        if (active) {
          setError("Unable to check workspace setup.");
          setReady(true);
        }
      });

    return () => {
      active = false;
    };
  }, [router]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const response = await submitOnboardingForm(event.currentTarget);
      const data = (await response.json().catch(() => null)) as { message?: string } | null;

      if (!response.ok) {
        clearPasswordFields(formRef.current);
        setError(data?.message ?? "Unable to create the first user.");
        return;
      }

      clearPasswordFields(formRef.current);
      startTransition(() => {
        router.replace("/");
        router.refresh();
      });
    } catch {
      clearPasswordFields(formRef.current);
      setError("Connection failed. Please try again in a moment.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen overflow-hidden bg-background text-foreground">
      <div className="relative min-h-screen">
        <div className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-7 px-4 py-5 sm:px-6 lg:px-8">
          <OnboardingHeader currentStep={step} />

          {step === "intro" ? (
            <IntroStep ready={ready} error={error} onContinue={() => setStep("form")} />
          ) : (
            <AdminSetupStep
              busy={busy}
              error={error}
              formRef={formRef}
              ready={ready}
              showConfirmPassword={showConfirmPassword}
              showPassword={showPassword}
              onBack={() => setStep("intro")}
              onSubmit={handleSubmit}
              onToggleConfirmPassword={() => setShowConfirmPassword((value) => !value)}
              onTogglePassword={() => setShowPassword((value) => !value)}
            />
          )}
        </div>
      </div>
    </main>
  );
}

async function handleReadinessResponse(
  response: Response,
  isActive: () => boolean,
  redirectToLogin: (href: string) => void,
  setReady: (ready: boolean) => void,
  setError: (error: string | null) => void
) {
  const data = (await response.json().catch(() => null)) as { required?: boolean; message?: string } | null;
  if (!isActive()) {
    return;
  }

  if (!response.ok) {
    setError(data?.message ?? "Unable to check workspace setup.");
    setReady(true);
    return;
  }

  if (!data?.required) {
    redirectToLogin("/login");
    return;
  }

  setReady(true);
}

function OnboardingHeader({ currentStep }: { currentStep: OnboardingStep }) {
  return (
    <header className="flex items-center justify-between gap-4 border-b border-border/70 pb-5">
      <div className="flex items-center gap-3">
        <SentroviaMark className="size-10 rounded-lg border border-border/80 bg-card text-lg text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]" />
        <div>
          <p className="text-sm font-semibold tracking-tight">Sentrovia</p>
          <p className="text-xs text-muted-foreground">First launch workspace setup</p>
        </div>
      </div>
      <StepIndicator currentStep={currentStep} />
    </header>
  );
}

function StepIndicator({ currentStep }: { currentStep: OnboardingStep }) {
  return (
    <div className="hidden items-center gap-2 sm:flex">
      <StepDot active={currentStep === "intro"} label="Overview" />
      <span className="h-px w-8 bg-border" />
      <StepDot active={currentStep === "form"} label="Admin account" />
    </div>
  );
}

function StepDot({ active, label }: { active: boolean; label: string }) {
  return (
    <div className={cn("flex items-center gap-2 text-xs", active ? "text-foreground" : "text-muted-foreground")}>
      <span className={cn("size-2 rounded-full", active ? "bg-primary shadow-[0_0_18px_rgba(99,102,241,0.85)]" : "bg-border")} />
      <span>{label}</span>
    </div>
  );
}

function IntroStep({ ready, error, onContinue }: { ready: boolean; error: string | null; onContinue: () => void }) {
  return (
    <section className="grid flex-1 items-center gap-10 py-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(420px,1.1fr)] lg:py-10">
      <div className="flex flex-col gap-8">
        <IntroCopy ready={ready} error={error} onContinue={onContinue} />
        <ProductStepList />
      </div>

      <MonitoringPreview />
    </section>
  );
}

function IntroCopy({ ready, error, onContinue }: { ready: boolean; error: string | null; onContinue: () => void }) {
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-4">
        <h1 className="max-w-2xl text-4xl leading-tight font-semibold text-balance sm:text-5xl">
          Set up Sentrovia monitoring
        </h1>
        <p className="max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">
          Create the first administrator, then add monitors, notification channels, and public status pages from the dashboard.
        </p>
      </div>
      {error ? <FormError message={error} /> : null}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button type="button" size="lg" disabled={!ready} onClick={onContinue} className="h-11 rounded-lg px-4">
          {ready ? (
            <>
              Continue setup
              <ArrowRight data-icon="inline-end" />
            </>
          ) : (
            <>
              <LoaderCircle data-icon="inline-start" className="animate-spin" />
              Checking workspace
            </>
          )}
        </Button>
        <p className="text-sm text-muted-foreground">The next step creates the first administrator account.</p>
      </div>
    </div>
  );
}

function ProductStepList() {
  return (
    <div className="grid border-y border-border/70 sm:grid-cols-3 sm:divide-x sm:divide-border/70">
      {productSteps.map((item) => (
        <div key={item.title} className="py-4 sm:px-4 sm:first:pl-0 sm:last:pr-0">
          <div className="mb-3 flex size-8 items-center justify-center rounded-md border border-border/80 bg-background">
            <item.icon className="size-4 text-foreground" />
          </div>
          <h2 className="text-sm font-semibold">{item.title}</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.description}</p>
        </div>
      ))}
    </div>
  );
}

function MonitoringPreview() {
  return (
    <div className="overflow-hidden rounded-lg border border-border/75 bg-card p-4">
      <PreviewHeader />
      <div className="mt-5 grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <MonitorSampleList />
        <VerificationTimeline />
      </div>
    </div>
  );
}

function PreviewHeader() {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-sm font-semibold">Monitor verification preview</p>
        <p className="mt-1 text-sm text-muted-foreground">Recent checks and their verification state.</p>
      </div>
      <Badge variant="outline" className="border-emerald-400/25 bg-emerald-400/10 text-emerald-200">
        Online
      </Badge>
    </div>
  );
}

function MonitorSampleList() {
  return (
    <div className="divide-y divide-border/70 rounded-lg border border-border/70 bg-surface-low/70 px-4">
      <MonitorSample url="https://api.example.com/health" detail="HTTP 200 - 184ms" tone="up" />
      <MonitorSample url="https://portal.example.com" detail="HTTP 200 - 1.2s" tone="up" />
      <MonitorSample url="db.example.net:5432" detail="Verification in progress" tone="pending" />
    </div>
  );
}

function MonitorSample({ url, detail, tone }: { url: string; detail: string; tone: "up" | "pending" }) {
  return (
    <div className="flex items-center gap-3 py-4">
      <span className={cn("size-2.5 shrink-0 rounded-full", tone === "up" ? "bg-emerald-400" : "bg-amber-300 animate-pulse")} />
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{url}</p>
        <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}

function VerificationTimeline() {
  return (
    <div className="flex flex-col justify-between gap-5 rounded-lg border border-border/65 bg-surface-low/70 p-4">
      <div>
        <p className="text-sm font-semibold">Verified notification</p>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">A single timeout waits for confirmation before it becomes an outage alert.</p>
      </div>
      <div className="grid gap-3">
        <TimelineRow label="Request timeout" meta="50s limit reached" tone="amber" />
        <TimelineRow label="Verification retry" meta="checking again" tone="blue" />
        <TimelineRow label="Service recovered" meta="no down alert sent" tone="emerald" />
      </div>
      <div className="rounded-md border border-emerald-400/20 bg-emerald-400/10 px-3 py-3 text-sm text-emerald-100">
        Online but slow is reported separately from confirmed down.
      </div>
    </div>
  );
}

function TimelineRow({ label, meta, tone }: { label: string; meta: string; tone: "amber" | "blue" | "emerald" }) {
  const toneClass = {
    amber: "bg-amber-300",
    blue: "bg-blue-400",
    emerald: "bg-emerald-400",
  }[tone];

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border/65 bg-background/55 px-3 py-3">
      <span className={cn("size-2.5 rounded-full", toneClass)} />
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{label}</p>
        <p className="truncate text-xs text-muted-foreground">{meta}</p>
      </div>
    </div>
  );
}

function AdminSetupStep({
  busy,
  error,
  formRef,
  ready,
  showConfirmPassword,
  showPassword,
  onBack,
  onSubmit,
  onToggleConfirmPassword,
  onTogglePassword,
}: {
  busy: boolean;
  error: string | null;
  formRef: React.RefObject<HTMLFormElement | null>;
  ready: boolean;
  showConfirmPassword: boolean;
  showPassword: boolean;
  onBack: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onToggleConfirmPassword: () => void;
  onTogglePassword: () => void;
}) {
  return (
    <section className="grid flex-1 items-center gap-6 py-4 lg:grid-cols-[minmax(280px,380px)_minmax(0,1fr)]">
      <SetupPanel onBack={onBack} />
      <AdminFormCard
        busy={busy}
        error={error}
        formRef={formRef}
        ready={ready}
        showConfirmPassword={showConfirmPassword}
        showPassword={showPassword}
        onSubmit={onSubmit}
        onToggleConfirmPassword={onToggleConfirmPassword}
        onTogglePassword={onTogglePassword}
      />
    </section>
  );
}

function SetupPanel({ onBack }: { onBack: () => void }) {
  return (
    <Card className="border-border/80 bg-card shadow-sm">
      <CardHeader>
        <CardTitle className="text-xl tracking-tight">Workspace access</CardTitle>
        <CardDescription>The first account becomes the administrator. Additional accounts are created by an admin.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {setupItems.map((item) => (
          <div key={item.label} className="flex items-center justify-between gap-4 rounded-lg border border-border/70 bg-muted/20 px-3 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border/80 bg-background">
                <item.icon className="size-4 text-muted-foreground" />
              </div>
              <p className="truncate text-sm font-medium">{item.label}</p>
            </div>
            <p className="shrink-0 text-sm text-muted-foreground">{item.value}</p>
          </div>
        ))}
        <div className="mt-1 flex items-center gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-3 text-sm text-emerald-200">
          <CheckCircle2 className="size-4 shrink-0" />
          <span>Ready for administrator details</span>
        </div>
        <Button type="button" variant="ghost" onClick={onBack} className="mt-2 justify-start text-muted-foreground">
          <ArrowLeft data-icon="inline-start" />
          Back to overview
        </Button>
      </CardContent>
    </Card>
  );
}

function AdminFormCard({
  busy,
  error,
  formRef,
  ready,
  showConfirmPassword,
  showPassword,
  onSubmit,
  onToggleConfirmPassword,
  onTogglePassword,
}: {
  busy: boolean;
  error: string | null;
  formRef: React.RefObject<HTMLFormElement | null>;
  ready: boolean;
  showConfirmPassword: boolean;
  showPassword: boolean;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onToggleConfirmPassword: () => void;
  onTogglePassword: () => void;
}) {
  return (
    <Card className="border-border/80 bg-card shadow-sm">
      <CardHeader className="gap-3 border-b border-border/70">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-2xl tracking-tight">Create administrator</CardTitle>
            <CardDescription>Use your own email or username. The role will be admin automatically.</CardDescription>
          </div>
          <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
            Admin role
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-6">
        <AdminForm
          busy={busy}
          error={error}
          formRef={formRef}
          ready={ready}
          showConfirmPassword={showConfirmPassword}
          showPassword={showPassword}
          onSubmit={onSubmit}
          onToggleConfirmPassword={onToggleConfirmPassword}
          onTogglePassword={onTogglePassword}
        />
      </CardContent>
    </Card>
  );
}

function AdminForm({
  busy,
  error,
  formRef,
  ready,
  showConfirmPassword,
  showPassword,
  onSubmit,
  onToggleConfirmPassword,
  onTogglePassword,
}: {
  busy: boolean;
  error: string | null;
  formRef: React.RefObject<HTMLFormElement | null>;
  ready: boolean;
  showConfirmPassword: boolean;
  showPassword: boolean;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onToggleConfirmPassword: () => void;
  onTogglePassword: () => void;
}) {
  return (
    <form ref={formRef} className="flex flex-col gap-5" onSubmit={onSubmit}>
      <AdminIdentityFields ready={ready} />
      <div className="grid gap-4 sm:grid-cols-2">
        <PasswordField id="password" label="Password" visible={showPassword} onToggle={onTogglePassword} disabled={!ready} />
        <PasswordField id="confirmPassword" label="Confirm password" visible={showConfirmPassword} onToggle={onToggleConfirmPassword} disabled={!ready} />
      </div>
      {error ? <FormError message={error} /> : null}
      <div className="flex justify-end">
        <Button type="submit" size="lg" disabled={!ready || busy} className="h-11 rounded-lg px-4">
          {busy ? (
            <>
              <LoaderCircle data-icon="inline-start" className="animate-spin" />
              Creating administrator
            </>
          ) : (
            <>
              Create administrator
              <ArrowRight data-icon="inline-end" />
            </>
          )}
        </Button>
      </div>
    </form>
  );
}

function AdminIdentityFields({ ready }: { ready: boolean }) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <FieldBlock label="First name" htmlFor="firstName">
          <Input id="firstName" name="firstName" autoComplete="given-name" required disabled={!ready} placeholder="Enter first name" className={inputClassName} />
        </FieldBlock>
        <FieldBlock label="Last name" htmlFor="lastName">
          <Input id="lastName" name="lastName" autoComplete="family-name" required disabled={!ready} placeholder="Enter last name" className={inputClassName} />
        </FieldBlock>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <FieldBlock label="Username" htmlFor="username">
          <Input id="username" name="username" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} required disabled={!ready} placeholder="your.username" className={inputClassName} />
        </FieldBlock>
        <FieldBlock label="Email" htmlFor="email">
          <Input id="email" name="email" type="email" autoComplete="email" required disabled={!ready} placeholder="name@company.com" className={inputClassName} />
        </FieldBlock>
      </div>

      <FieldBlock label="Department" htmlFor="department" aside={<span className="text-[11px] text-muted-foreground">Optional</span>}>
        <Input id="department" name="department" autoComplete="organization-title" disabled={!ready} placeholder="Operations, SRE, IT" className={inputClassName} />
      </FieldBlock>
    </>
  );
}

function PasswordField({
  id,
  label,
  visible,
  disabled,
  onToggle,
}: {
  id: "password" | "confirmPassword";
  label: string;
  visible: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <FieldBlock label={label} htmlFor={id}>
      <div className="relative">
        <Input id={id} name={id} type={visible ? "text" : "password"} autoComplete="new-password" minLength={12} maxLength={128} required disabled={disabled} placeholder={id === "password" ? "Minimum 12 characters" : "Repeat password"} className={cn(inputClassName, "pr-12")} />
        <Button type="button" variant="ghost" size="icon-sm" onClick={onToggle} disabled={disabled} className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-lg text-muted-foreground hover:bg-muted/70 hover:text-foreground" aria-label={visible ? "Hide password" : "Show password"}>
          {visible ? <Eye /> : <EyeOff />}
        </Button>
      </div>
    </FieldBlock>
  );
}

async function submitOnboardingForm(form: HTMLFormElement) {
  return fetch("/api/auth/onboarding", {
    method: "POST",
    cache: "no-store",
    credentials: "same-origin",
    referrerPolicy: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(readOnboardingPayload(form)),
  });
}

function readOnboardingPayload(form: HTMLFormElement) {
  const formData = new FormData(form);

  return {
    firstName: String(formData.get("firstName") ?? ""),
    lastName: String(formData.get("lastName") ?? ""),
    username: String(formData.get("username") ?? ""),
    email: String(formData.get("email") ?? ""),
    department: String(formData.get("department") ?? ""),
    password: String(formData.get("password") ?? ""),
    confirmPassword: String(formData.get("confirmPassword") ?? ""),
  };
}

function clearPasswordFields(form: HTMLFormElement | null) {
  if (!form) {
    return;
  }

  for (const name of ["password", "confirmPassword"]) {
    const input = form.elements.namedItem(name);
    if (input instanceof HTMLInputElement) {
      input.value = "";
    }
  }
}

function FormError({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive-foreground">
      {message}
    </div>
  );
}

function FieldBlock({
  label,
  htmlFor,
  aside,
  children,
}: {
  label: string;
  htmlFor: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={htmlFor} className="text-xs font-medium text-muted-foreground">
          {label}
        </Label>
        {aside}
      </div>
      {children}
    </div>
  );
}
