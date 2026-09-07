"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  ArrowLeft,
  ChevronRight,
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
  "h-11 rounded-md border-white/10 bg-[#0d0e11] text-foreground placeholder:text-zinc-500 focus-visible:border-primary/60 focus-visible:ring-primary/20";

const setupItems = [
  { label: "Role", value: "Workspace administrator" },
  { label: "Scope", value: "All settings and members" },
  { label: "Storage", value: "Self-hosted PostgreSQL" },
];

const setupNotes = [
  {
    title: "One administrator to start",
    description: "This account owns initial access. You can invite and manage members after signing in.",
  },
  {
    title: "No sample data",
    description: "The workspace starts empty so you can add only the monitors and delivery routes you need.",
  },
  {
    title: "Configuration stays local",
    description: "Account and monitoring data are stored in the PostgreSQL database connected to this installation.",
  },
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
    <main className="min-h-screen bg-[#090a0c] text-foreground">
      <div className="mx-auto flex min-h-screen w-full max-w-[1240px] flex-col px-5 py-6 sm:px-8 lg:px-12">
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
    <header className="flex items-center justify-between gap-4 border-b border-white/[0.08] pb-5">
      <div className="flex items-center gap-3">
        <SentroviaMark className="size-8 text-primary" />
        <div>
          <p className="text-sm font-semibold tracking-[-0.02em]">Sentrovia</p>
          <p className="text-[13px] text-zinc-400">Workspace initialization</p>
        </div>
      </div>
      <StepIndicator currentStep={currentStep} />
    </header>
  );
}

function StepIndicator({ currentStep }: { currentStep: OnboardingStep }) {
  return (
    <ol className="flex items-center gap-3 text-[13px]" aria-label="Setup progress">
      <SetupStepNumber number="Step 1" label="Overview" active={currentStep === "intro"} complete={currentStep === "form"} />
      <span className="text-zinc-700" aria-hidden="true">/</span>
      <SetupStepNumber number="Step 2" label="Administrator" active={currentStep === "form"} />
    </ol>
  );
}

function SetupStepNumber({
  number,
  label,
  active,
  complete = false,
}: {
  number: string;
  label: string;
  active: boolean;
  complete?: boolean;
}) {
  return (
    <li className={cn("flex items-center gap-2", active ? "text-zinc-100" : complete ? "text-zinc-400" : "text-zinc-500")}>
      <span className={cn("text-[13px]", active && "text-primary")}>{number}</span>
      <span className="hidden sm:inline">{label}</span>
    </li>
  );
}

function IntroStep({ ready, error, onContinue }: { ready: boolean; error: string | null; onContinue: () => void }) {
  return (
    <section className="flex flex-1 py-12 sm:py-16 lg:py-20">
      <div className="grid w-full max-w-[1080px] content-start gap-12 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-20">
        <IntroCopy ready={ready} error={error} onContinue={onContinue} />
        <SetupNotes />
      </div>
    </section>
  );
}

function IntroCopy({ ready, error, onContinue }: { ready: boolean; error: string | null; onContinue: () => void }) {
  return (
    <div className="auth-reveal flex max-w-[650px] flex-col">
      <div>
        <p className="text-sm font-medium text-primary">First-time setup</p>
        <h1 className="mt-4 max-w-2xl text-3xl leading-[1.12] font-semibold tracking-[-0.035em] text-balance sm:text-[2.65rem]">
          Create the administrator for this workspace.
        </h1>
        <p className="mt-5 max-w-[580px] text-[0.95rem] leading-7 text-zinc-400 sm:text-base">
          The first account controls members, monitoring settings, and incident delivery. You can change the profile details later.
        </p>
      </div>
      {error ? <div className="mt-6"><FormError message={error} /></div> : null}
      <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-3">
        <Button type="button" size="lg" disabled={!ready} onClick={onContinue} className="h-11 rounded-md px-4 font-semibold">
          {ready ? (
            <>
              Create administrator
              <ChevronRight data-icon="inline-end" />
            </>
          ) : (
            <>
              <LoaderCircle data-icon="inline-start" className="animate-spin" />
              Checking workspace
            </>
          )}
        </Button>
        <span className="text-[13px] text-zinc-400">Step 1 of 2 · About one minute</span>
      </div>
    </div>
  );
}

function SetupNotes() {
  return (
    <aside className="auth-reveal auth-delay-1 border-t border-white/[0.08] pt-6 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-9">
      <h2 className="text-sm font-semibold tracking-[-0.01em] text-zinc-200">Before you continue</h2>
      <div className="mt-5 space-y-5">
        {setupNotes.map((note, index) => (
          <section key={note.title} className="grid grid-cols-[24px_1fr] gap-3">
            <span className="pt-0.5 text-[13px] text-zinc-400">{index + 1}.</span>
            <div>
              <h3 className="text-sm font-medium text-zinc-300">{note.title}</h3>
              <p className="mt-1.5 text-[13px] leading-5 text-zinc-400">{note.description}</p>
            </div>
          </section>
        ))}
      </div>
    </aside>
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
    <section className="grid w-full max-w-[1080px] flex-1 content-start gap-10 py-10 sm:py-14 lg:grid-cols-[280px_minmax(0,1fr)] lg:gap-16">
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
    <aside>
      <p className="text-sm font-medium text-primary">Step 2 of 2</p>
      <h1 className="mt-3 text-2xl font-semibold tracking-[-0.03em]">Administrator details</h1>
      <p className="mt-3 text-sm leading-6 text-zinc-400">
        This account receives full access to the workspace.
      </p>
      <dl className="mt-6 divide-y divide-white/[0.08] border-y border-white/[0.08]">
        {setupItems.map((item) => (
          <div key={item.label} className="flex items-center justify-between gap-4 py-3">
            <dt className="text-[13px] text-zinc-400">{item.label}</dt>
            <dd className="text-[13px] text-right text-zinc-300">{item.value}</dd>
          </div>
        ))}
      </dl>
      <Button type="button" variant="ghost" onClick={onBack} className="mt-5 justify-start px-0 text-zinc-400 hover:bg-transparent hover:text-zinc-200">
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
    <section className="max-w-[680px] border-t border-white/[0.08] pt-6 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-12">
      <div className="mb-7">
        <h2 className="text-xl font-semibold tracking-[-0.025em]">Create administrator</h2>
        <p className="mt-2 text-sm leading-6 text-zinc-400">
          Use an individual account rather than a shared team login.
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
      <div className="flex items-center justify-between gap-4 border-t border-white/[0.08] pt-5">
        <p className="hidden text-[13px] text-zinc-400 sm:block">You will be signed in after this step.</p>
        <Button type="submit" size="lg" disabled={!ready || busy} className="h-11 rounded-md px-4">
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
        <Button type="button" variant="ghost" size="icon-sm" onClick={onToggle} disabled={disabled} className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-sm text-muted-foreground hover:bg-muted/70 hover:text-foreground" aria-label={visible ? "Hide password" : "Show password"}>
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
        <Label htmlFor={htmlFor} className="text-[13px] font-medium text-zinc-400">
          {label}
        </Label>
        {aside}
      </div>
      {children}
    </div>
  );
}
