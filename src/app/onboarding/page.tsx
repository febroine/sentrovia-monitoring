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
type OnboardingFieldName = "firstName" | "lastName" | "username" | "email" | "password" | "confirmPassword";
type OnboardingFieldErrors = Partial<Record<OnboardingFieldName, string>>;

const onboardingFieldNames: OnboardingFieldName[] = [
  "firstName",
  "lastName",
  "username",
  "email",
  "password",
  "confirmPassword",
];

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
    description: "Create the first account now. Add other members after signing in.",
  },
  {
    title: "No sample data",
    description: "Start with an empty workspace and add your own monitors.",
  },
  {
    title: "Configuration stays local",
    description: "Account and monitoring data stay in this installation’s PostgreSQL database.",
  },
];

const firstWorkspaceTasks = [
  {
    title: "Add your first monitor",
    location: "Monitoring",
    description: "Add a service and check its first result. If it stays pending, check Worker pulse.",
  },
  {
    title: "Set up and test notifications",
    location: "Settings · Notifications / Delivery",
    description: "Choose your alert destinations and send a test from Delivery.",
  },
  {
    title: "Give your team access",
    location: "Members · Optional",
    description: "Add teammates and assign their access when you’re ready.",
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
  const [fieldErrors, setFieldErrors] = useState<OnboardingFieldErrors>({});
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
    setFieldErrors({});
    setSubmitting(true);

    try {
      const response = await submitOnboardingForm(event.currentTarget);
      const data = (await response.json().catch(() => null)) as { message?: string; fieldErrors?: unknown } | null;

      if (!response.ok) {
        clearPasswordFields(formRef.current);
        const nextFieldErrors = parseOnboardingFieldErrors(data?.fieldErrors);
        setFieldErrors(nextFieldErrors);
        setError(hasFieldErrors(nextFieldErrors) ? null : data?.message ?? "Unable to create the first user.");
        focusFirstInvalidField(formRef.current, nextFieldErrors);
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
      <div className="flex min-h-screen w-full flex-col lg:flex-row">
          <OnboardingHeader currentStep={step} />
          <div className="min-w-0 flex-1 px-5 py-10 sm:px-10 lg:px-16 lg:py-16">
          {step === "intro" ? (
            <IntroStep ready={ready} error={error} onContinue={() => setStep("form")} />
          ) : (
            <AdminSetupStep
              busy={busy}
              error={error}
              fieldErrors={fieldErrors}
              formRef={formRef}
              ready={ready}
              showConfirmPassword={showConfirmPassword}
              showPassword={showPassword}
              onBack={() => setStep("intro")}
              onFieldInput={(field) => setFieldErrors((current) => clearFieldError(current, field))}
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
    <header className="flex flex-wrap items-center justify-between gap-6 border-b border-white/[0.08] bg-surface-low px-5 py-5 sm:px-10 lg:w-64 lg:shrink-0 lg:flex-col lg:items-start lg:justify-start lg:gap-16 lg:border-r lg:border-b-0 lg:px-7 lg:py-10">
      <div className="flex items-center gap-3">
        <SentroviaMark className="size-8 text-primary" />
        <div>
          <p className="text-sm font-semibold tracking-[-0.02em]">Sentrovia</p>
          <p className="text-[13px] text-zinc-400">Workspace setup</p>
        </div>
      </div>
      <StepIndicator currentStep={currentStep} />
    </header>
  );
}

function StepIndicator({ currentStep }: { currentStep: OnboardingStep }) {
  return (
    <ol className="flex items-center gap-5 text-[13px] lg:w-full lg:flex-col lg:items-stretch lg:gap-7" aria-label="Setup progress">
      <SetupStepNumber number="Step 1" label="Overview" active={currentStep === "intro"} complete={currentStep === "form"} />
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
    <li aria-current={active ? "step" : undefined} className={cn("flex items-center gap-2 lg:flex-col lg:items-start lg:gap-1", active ? "text-zinc-100" : "text-zinc-400")}>
      <span className={cn("text-[13px]", active && "text-indigo-400")}>{number}{complete ? " · Complete" : ""}</span>
      <span className="hidden font-medium sm:inline lg:text-sm">{label}</span>
    </li>
  );
}

function IntroStep({ ready, error, onContinue }: { ready: boolean; error: string | null; onContinue: () => void }) {
  return (
    <section className="w-full">
      <div className="grid items-start gap-10 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,1fr)] xl:gap-16">
        <IntroCopy ready={ready} error={error} onContinue={onContinue} />
        <SetupNotes />
      </div>
      <FirstWorkspaceTasks />
    </section>
  );
}

function IntroCopy({ ready, error, onContinue }: { ready: boolean; error: string | null; onContinue: () => void }) {
  return (
    <div className="flex max-w-2xl flex-col">
      <div>
        <h1 className="max-w-xl text-3xl leading-tight font-semibold tracking-[-0.025em] text-balance sm:text-[2rem]">
          Create the administrator for this workspace.
        </h1>
        <p className="mt-4 max-w-xl text-base leading-7 text-zinc-400">
          This account will manage members, monitors, and notification settings.
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
              Checking workspace…
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

function SetupNotes() {
  return (
    <aside className="border-t border-white/[0.08] pt-6 xl:border-t-0 xl:border-l xl:pt-0 xl:pl-8">
      <h2 className="text-sm font-semibold tracking-[-0.01em] text-zinc-200">Before you continue</h2>
      <div className="mt-5 grid gap-5 md:grid-cols-3 xl:grid-cols-1">
        {setupNotes.map((note) => (
          <section
            key={note.title}
            className="space-y-2"
          >
            <h3 className="text-sm font-medium text-zinc-300">{note.title}</h3>
            <p className="text-sm leading-6 text-zinc-400">{note.description}</p>
          </section>
        ))}
      </div>
    </aside>
  );
}

function FirstWorkspaceTasks() {
  return (
    <section aria-labelledby="first-workspace-tasks" className="mt-12 border-t border-white/[0.08] pt-8">
      <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-2">
        <h2 id="first-workspace-tasks" className="text-xl font-semibold tracking-[-0.02em]">After you sign in</h2>
        <p className="text-sm leading-6 text-zinc-400">Available in your workspace after setup.</p>
      </div>
      <ol className="mt-6 divide-y divide-white/[0.08]">
        {firstWorkspaceTasks.map((task, index) => (
          <li key={task.title} className="grid grid-cols-[24px_minmax(0,1fr)] gap-x-4 gap-y-3 py-6 sm:gap-x-6 xl:grid-cols-[24px_minmax(240px,0.8fr)_minmax(0,1.4fr)]">
            <span aria-hidden="true" className="text-sm leading-6 text-zinc-400">{index + 1}.</span>
            <div>
              <h3 className="text-base font-medium leading-6 text-zinc-200">{task.title}</h3>
              <p className="mt-1 text-sm leading-6 text-zinc-400">{task.location}</p>
            </div>
            <p className="col-start-2 max-w-2xl text-sm leading-6 text-zinc-400 xl:col-start-auto">{task.description}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function AdminSetupStep({
  busy,
  error,
  fieldErrors,
  formRef,
  ready,
  showConfirmPassword,
  showPassword,
  onBack,
  onFieldInput,
  onSubmit,
  onToggleConfirmPassword,
  onTogglePassword,
}: {
  busy: boolean;
  error: string | null;
  fieldErrors: OnboardingFieldErrors;
  formRef: React.RefObject<HTMLFormElement | null>;
  ready: boolean;
  showConfirmPassword: boolean;
  showPassword: boolean;
  onBack: () => void;
  onFieldInput: (field: OnboardingFieldName) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onToggleConfirmPassword: () => void;
  onTogglePassword: () => void;
}) {
  return (
    <section className="w-full">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-[-0.025em]">Create administrator</h1>
          <p className="mt-3 text-base leading-7 text-zinc-400">Use your own details. All fields are required.</p>
        </div>
        <Button type="button" variant="ghost" onClick={onBack} className="text-zinc-400 hover:text-zinc-200">
          <ArrowLeft data-icon="inline-start" />
          Back to overview
        </Button>
      </div>
      <div className="grid items-start gap-10 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,1fr)] xl:gap-16">
      <AdminFormCard
        busy={busy}
        error={error}
        fieldErrors={fieldErrors}
        formRef={formRef}
        ready={ready}
        showConfirmPassword={showConfirmPassword}
        showPassword={showPassword}
        onFieldInput={onFieldInput}
        onSubmit={onSubmit}
        onToggleConfirmPassword={onToggleConfirmPassword}
        onTogglePassword={onTogglePassword}
      />
      <SetupPanel />
      </div>
      <section className="mt-10 border-t border-white/[0.08] pt-6" aria-labelledby="account-created-next">
        <h2 id="account-created-next" className="text-lg font-semibold tracking-[-0.02em]">Once your account is created</h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-400">First-time setup closes. Add more accounts from Members, or change your own details from Profile.</p>
      </section>
    </section>
  );
}

function SetupPanel() {
  return (
    <aside className="border-t border-white/[0.08] pt-6 xl:border-t-0 xl:border-l xl:pt-0 xl:pl-8">
      <h2 className="text-base font-semibold">Account access</h2>
      <dl className="mt-3 divide-y divide-white/[0.08]">
        {setupItems.map((item) => (
          <div key={item.label} className="flex items-center justify-between gap-4 py-3">
            <dt className="text-[13px] text-zinc-400">{item.label}</dt>
            <dd className="text-[13px] text-right text-zinc-300">{item.value}</dd>
          </div>
        ))}
      </dl>
      <h3 className="mt-6 text-sm font-medium text-zinc-200">Signing in later</h3>
      <p className="mt-2 text-sm leading-6 text-zinc-400">Sign in with your email or username and password.</p>
      <h3 className="mt-6 text-sm font-medium text-zinc-200">Choose a personal password</h3>
      <p className="mt-2 text-sm leading-6 text-zinc-400">Use a unique password of at least 12 characters. Save it in your password manager.</p>
    </aside>
  );
}

function AdminFormCard({
  busy,
  error,
  fieldErrors,
  formRef,
  ready,
  showConfirmPassword,
  showPassword,
  onFieldInput,
  onSubmit,
  onToggleConfirmPassword,
  onTogglePassword,
}: {
  busy: boolean;
  error: string | null;
  fieldErrors: OnboardingFieldErrors;
  formRef: React.RefObject<HTMLFormElement | null>;
  ready: boolean;
  showConfirmPassword: boolean;
  showPassword: boolean;
  onFieldInput: (field: OnboardingFieldName) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onToggleConfirmPassword: () => void;
  onTogglePassword: () => void;
}) {
  return (
    <section className="min-w-0">
        <AdminForm
          busy={busy}
          error={error}
          fieldErrors={fieldErrors}
          formRef={formRef}
          ready={ready}
          showConfirmPassword={showConfirmPassword}
          showPassword={showPassword}
          onFieldInput={onFieldInput}
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
  fieldErrors,
  formRef,
  ready,
  showConfirmPassword,
  showPassword,
  onFieldInput,
  onSubmit,
  onToggleConfirmPassword,
  onTogglePassword,
}: {
  busy: boolean;
  error: string | null;
  fieldErrors: OnboardingFieldErrors;
  formRef: React.RefObject<HTMLFormElement | null>;
  ready: boolean;
  showConfirmPassword: boolean;
  showPassword: boolean;
  onFieldInput: (field: OnboardingFieldName) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onToggleConfirmPassword: () => void;
  onTogglePassword: () => void;
}) {
  return (
    <form
      ref={formRef}
      className="flex flex-col gap-5"
      onInput={(event) => handleFieldInput(event, onFieldInput)}
      onSubmit={onSubmit}
    >
      <AdminIdentityFields fieldErrors={fieldErrors} ready={ready} />
      <div className="grid gap-4 sm:grid-cols-2">
        <PasswordField id="password" label="Password" error={fieldErrors.password} visible={showPassword} onToggle={onTogglePassword} disabled={!ready} />
        <PasswordField id="confirmPassword" label="Confirm password" error={fieldErrors.confirmPassword} visible={showConfirmPassword} onToggle={onToggleConfirmPassword} disabled={!ready} />
      </div>
      {error ? <FormError message={error} /> : null}
      <div className="flex items-center justify-between gap-4 border-t border-white/[0.08] pt-5">
        <p className="hidden text-[13px] text-zinc-400 sm:block">You will be signed in after this step.</p>
        <Button type="submit" size="lg" disabled={!ready || busy} className="h-11 rounded-md px-4">
          {busy ? (
            <>
              <LoaderCircle data-icon="inline-start" className="animate-spin" />
              Creating administrator…
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

function AdminIdentityFields({ fieldErrors, ready }: { fieldErrors: OnboardingFieldErrors; ready: boolean }) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <FieldBlock label="First name" htmlFor="firstName" error={fieldErrors.firstName}>
          <Input id="firstName" name="firstName" autoComplete="given-name" required disabled={!ready} aria-invalid={Boolean(fieldErrors.firstName)} aria-describedby={fieldErrors.firstName ? fieldErrorId("firstName") : undefined} className={inputClassName} />
        </FieldBlock>
        <FieldBlock label="Last name" htmlFor="lastName" error={fieldErrors.lastName}>
          <Input id="lastName" name="lastName" autoComplete="family-name" required disabled={!ready} aria-invalid={Boolean(fieldErrors.lastName)} aria-describedby={fieldErrors.lastName ? fieldErrorId("lastName") : undefined} className={inputClassName} />
        </FieldBlock>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <FieldBlock label="Username" htmlFor="username" error={fieldErrors.username}>
          <Input id="username" name="username" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} required disabled={!ready} aria-invalid={Boolean(fieldErrors.username)} aria-describedby={fieldErrors.username ? fieldErrorId("username") : undefined} placeholder="your.username" className={inputClassName} />
        </FieldBlock>
        <FieldBlock label="Email" htmlFor="email" error={fieldErrors.email}>
          <Input id="email" name="email" type="email" autoComplete="email" spellCheck={false} required disabled={!ready} aria-invalid={Boolean(fieldErrors.email)} aria-describedby={fieldErrors.email ? fieldErrorId("email") : undefined} placeholder="name@company.com" className={inputClassName} />
        </FieldBlock>
      </div>
    </>
  );
}

function PasswordField({
  id,
  label,
  error,
  visible,
  disabled,
  onToggle,
}: {
  id: "password" | "confirmPassword";
  label: string;
  error?: string;
  visible: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <FieldBlock label={label} htmlFor={id} error={error}>
      <div className="relative">
        <Input id={id} name={id} type={visible ? "text" : "password"} autoComplete="new-password" minLength={12} maxLength={128} required disabled={disabled} aria-invalid={Boolean(error)} aria-describedby={error ? fieldErrorId(id) : undefined} placeholder={id === "password" ? "Minimum 12 characters" : "Repeat password"} className={cn(inputClassName, "pr-12")} />
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

function parseOnboardingFieldErrors(value: unknown): OnboardingFieldErrors {
  if (!value || typeof value !== "object") {
    return {};
  }

  const fieldErrors: OnboardingFieldErrors = {};
  for (const field of onboardingFieldNames) {
    const message = (value as Record<string, unknown>)[field];
    if (typeof message === "string" && message.length > 0) {
      fieldErrors[field] = message;
    }
  }

  return fieldErrors;
}

function hasFieldErrors(fieldErrors: OnboardingFieldErrors) {
  return onboardingFieldNames.some((field) => Boolean(fieldErrors[field]));
}

function focusFirstInvalidField(form: HTMLFormElement | null, fieldErrors: OnboardingFieldErrors) {
  const firstInvalidField = onboardingFieldNames.find((field) => fieldErrors[field]);
  const input = firstInvalidField ? form?.elements.namedItem(firstInvalidField) : null;
  if (input instanceof HTMLInputElement) {
    input.focus();
  }
}

function handleFieldInput(event: React.FormEvent<HTMLFormElement>, onFieldInput: (field: OnboardingFieldName) => void) {
  const target = event.target;
  if (target instanceof HTMLInputElement && onboardingFieldNames.includes(target.name as OnboardingFieldName)) {
    onFieldInput(target.name as OnboardingFieldName);
  }
}

function clearFieldError(fieldErrors: OnboardingFieldErrors, field: OnboardingFieldName) {
  if (!fieldErrors[field]) {
    return fieldErrors;
  }

  const nextFieldErrors = { ...fieldErrors };
  delete nextFieldErrors[field];
  return nextFieldErrors;
}

function fieldErrorId(field: OnboardingFieldName) {
  return `${field}-error`;
}

function FormError({ message }: { message: string }) {
  return (
    <div role="alert" aria-live="polite" className="border-l-2 border-destructive px-4 py-2 text-sm text-destructive-foreground">
      {message}
    </div>
  );
}

function FieldBlock({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string;
  htmlFor: OnboardingFieldName;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2.5">
      <Label htmlFor={htmlFor} className="text-[13px] font-medium text-zinc-400">
        {label}
      </Label>
      {children}
      {error ? (
        <p id={fieldErrorId(htmlFor)} role="alert" className="text-[13px] leading-5 text-destructive-foreground">
          {error}
        </p>
      ) : null}
    </div>
  );
}
