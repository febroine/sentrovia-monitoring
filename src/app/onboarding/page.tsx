"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  ArrowLeft,
  Eye,
  EyeOff,
  LoaderCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SentroviaMark } from "@/components/brand/sentrovia-mark";
import { cn } from "@/lib/utils";

type OnboardingStep = "intro" | "form";

const inputClassName =
  "h-11 rounded-md border-white/10 bg-[#0d0e11] text-foreground placeholder:text-muted-foreground/70 focus-visible:border-primary/60 focus-visible:ring-primary/20";

const productSteps = [
  { title: "Monitor", description: "Add websites, APIs, TCP, PostgreSQL, ping, and heartbeat checks." },
  { title: "Verify", description: "Confirm failures before the first outage message is sent." },
  { title: "Notify", description: "Send alerts with the reason, timing, and latest evidence." },
];

const setupItems = [
  { label: "Administrator", value: "First account" },
  { label: "Members", value: "Admin-managed" },
  { label: "Access", value: "Admin-controlled" },
  { label: "Storage", value: "PostgreSQL" },
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
    <main className="min-h-screen overflow-hidden bg-[#090a0c] text-foreground">
      <div className="relative min-h-screen">
        <div className="relative mx-auto flex min-h-screen w-full max-w-[1440px] flex-col gap-7 px-5 py-6 sm:px-8 lg:px-12">
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
    <header className="flex items-center justify-between gap-4 border-b border-white/10 pb-5">
      <div className="flex items-center gap-3">
        <SentroviaMark className="size-9 text-emerald-300" />
        <div>
          <p className="text-sm font-semibold tracking-tight">Sentrovia</p>
          <p className="text-xs text-muted-foreground">First launch setup</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span className="hidden text-xs text-muted-foreground sm:inline">Workspace setup</span>
        <StepIndicator currentStep={currentStep} />
      </div>
    </header>
  );
}

function StepIndicator({ currentStep }: { currentStep: OnboardingStep }) {
  return (
    <div className="hidden items-center gap-2 sm:flex">
      <StepDot active={currentStep === "intro"} label="Overview" />
      <span className="h-px w-8 bg-white/15" />
      <StepDot active={currentStep === "form"} label="Admin account" />
    </div>
  );
}

function StepDot({ active, label }: { active: boolean; label: string }) {
  return (
    <div className={cn("flex items-center gap-2 text-xs", active ? "text-foreground" : "text-muted-foreground")}>
      <span className={cn("size-2 rounded-full", active ? "bg-primary" : "bg-white/15")} />
      <span>{label}</span>
    </div>
  );
}

function IntroStep({ ready, error, onContinue }: { ready: boolean; error: string | null; onContinue: () => void }) {
  return (
    <section className="flex flex-1 items-center py-8 lg:py-12">
      <div className="flex w-full max-w-4xl flex-col gap-8">
        <IntroCopy ready={ready} error={error} onContinue={onContinue} />
        <ProductStepList />
      </div>
    </section>
  );
}

function IntroCopy({ ready, error, onContinue }: { ready: boolean; error: string | null; onContinue: () => void }) {
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-4">
        <h1 className="max-w-2xl text-3xl leading-tight font-semibold tracking-tight text-balance sm:text-4xl">
          Create the workspace administrator
        </h1>
        <p className="max-w-xl text-base leading-7 text-zinc-400 sm:text-lg">
          Create the first account. Monitors and delivery channels come next.
        </p>
      </div>
      {error ? <FormError message={error} /> : null}
      <div>
        <Button type="button" size="lg" disabled={!ready} onClick={onContinue} className="h-11 rounded-lg px-4">
          {ready ? (
            <>
              Continue setup
            </>
          ) : (
            <>
              <LoaderCircle data-icon="inline-start" className="animate-spin" />
              Checking workspace
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

function ProductStepList() {
  return (
    <div className="grid gap-5 border-y border-white/10 py-1 sm:grid-cols-3 sm:divide-x sm:divide-white/10">
      {productSteps.map((item) => (
        <div key={item.title} className="py-4 sm:px-5 sm:first:pl-0 sm:last:pr-0">
          <h2 className="text-sm font-semibold">{item.title}</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.description}</p>
        </div>
      ))}
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
    <section className="grid flex-1 items-center gap-8 py-6 lg:grid-cols-[minmax(280px,360px)_minmax(0,1fr)]">
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
    <aside className="border-y border-white/10 py-5">
      <h2 className="text-lg font-semibold tracking-tight">Workspace access</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        The first account becomes the administrator. Additional accounts are created by an admin.
      </p>
      <dl className="mt-5 divide-y divide-white/10 border-t border-white/10">
        {setupItems.map((item) => (
          <div key={item.label} className="flex items-center justify-between gap-4 py-3">
            <dt className="text-sm text-muted-foreground">{item.label}</dt>
            <dd className="text-sm font-medium">{item.value}</dd>
          </div>
        ))}
      </dl>
      <Button type="button" variant="ghost" onClick={onBack} className="mt-4 justify-start px-0 text-muted-foreground hover:bg-transparent hover:text-foreground">
        <ArrowLeft data-icon="inline-start" />
        Back to overview
      </Button>
    </aside>
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
    <section className="border-y border-white/10 py-6">
      <div className="mb-6 border-b border-white/10 pb-5">
        <h2 className="text-2xl font-semibold tracking-tight">Create administrator</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          This first account receives administrator access.
        </p>
      </div>
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
    </section>
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
          <Input id="firstName" name="firstName" autoComplete="given-name" required disabled={!ready} className={inputClassName} />
        </FieldBlock>
        <FieldBlock label="Last name" htmlFor="lastName">
          <Input id="lastName" name="lastName" autoComplete="family-name" required disabled={!ready} className={inputClassName} />
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
    <div className="border-l-2 border-destructive px-4 py-2 text-sm text-destructive-foreground">
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
