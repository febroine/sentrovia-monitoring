"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { ArrowLeft, ArrowRight, Eye, EyeOff, LoaderCircle } from "lucide-react";
import { ObservatoryShell } from "@/components/auth/observatory-shell";
import styles from "@/components/auth/auth-shell.module.css";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type OnboardingFieldName = "firstName" | "lastName" | "username" | "email" | "password" | "confirmPassword";
type OnboardingFieldErrors = Partial<Record<OnboardingFieldName, string>>;

const onboardingFieldNames: OnboardingFieldName[] = ["firstName", "lastName", "username", "email", "password", "confirmPassword"];
const inputClassName =
  "h-12 rounded-[9px] border-blue-200/25 bg-[#091426]/78 px-3.5 text-[0.9rem] text-white shadow-[inset_0_1px_rgba(255,255,255,0.025),0_12px_30px_rgba(0,0,0,0.1)] backdrop-blur-[2px] transition-[border-color,background-color,box-shadow] duration-150 placeholder:text-blue-100/35 hover:border-blue-100/40 focus-visible:border-primary/85 focus-visible:bg-[#0a172b]/90 focus-visible:ring-2 focus-visible:ring-primary/25";

export default function OnboardingPage() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [step, setStep] = useState<"welcome" | "administrator">("welcome");
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
      .then(async (response) => handleReadinessResponse(response, () => active, (href) => router.replace(href), setReady, setError))
      .catch(() => {
        if (active) {
          setError("Unable to check workspace setup.");
          setReady(true);
        }
      });
    return () => { active = false; };
  }, [router]);

  useEffect(() => {
    if (step !== "administrator" || !ready) return;
    const frameId = window.requestAnimationFrame(() => {
      const firstNameField = formRef.current?.elements.namedItem("firstName");
      if (firstNameField instanceof HTMLInputElement) firstNameField.focus();
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [ready, step]);

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

  if (step === "welcome") {
    return <WelcomeStep error={error} ready={ready} onGetStarted={() => setStep("administrator")} />;
  }

  return (
    <ObservatoryShell contextLabel="Workspace setup · 2 of 2" scrim="broad">
      <section className="flex min-h-svh items-center justify-center px-5 pb-8 pt-24 sm:px-8 sm:pb-10 sm:pt-28">
        <div className={`${styles.authForm} w-full max-w-[46rem]`}>
          <Button type="button" variant="ghost" onClick={() => setStep("welcome")} disabled={busy} className="-ml-3 mb-3 h-11 gap-2 px-3 text-blue-100/58 hover:bg-blue-100/8 hover:text-white focus-visible:ring-primary/35 sm:mb-4">
            <ArrowLeft aria-hidden="true" data-icon="inline-start" />
            Back
          </Button>

          <header className="mb-5 text-center sm:mb-6">
            <p className="mb-2 text-[0.72rem] font-medium tracking-[0.08em] text-primary sm:hidden">Step 2 of 2</p>
            <h1 id="administrator-title" className="text-balance text-[2rem] font-semibold leading-none tracking-[-0.04em] text-white sm:text-[2.55rem]">Create the administrator</h1>
            <p className="mx-auto mt-3 max-w-xl text-[0.88rem] leading-5 text-blue-100/62 sm:text-[0.95rem] sm:leading-6">This account manages monitors, members, notifications, and workspace settings.</p>
          </header>

          <AdminForm
            busy={busy}
            error={error}
            fieldErrors={fieldErrors}
            formRef={formRef}
            ready={ready}
            showConfirmPassword={showConfirmPassword}
            showPassword={showPassword}
            onFieldInput={(field) => setFieldErrors((current) => clearFieldError(current, field))}
            onSubmit={handleSubmit}
            onToggleConfirmPassword={() => setShowConfirmPassword((value) => !value)}
            onTogglePassword={() => setShowPassword((value) => !value)}
          />
        </div>
      </section>
    </ObservatoryShell>
  );
}

function WelcomeStep({ error, ready, onGetStarted }: { error: string | null; ready: boolean; onGetStarted: () => void }) {
  return (
    <ObservatoryShell contextLabel="Workspace setup · 1 of 2" footerText="Your first administrator is created in this workspace.">
      <section className="flex min-h-svh items-center justify-center px-5 py-24 sm:px-8 sm:py-28">
        <div className={`${styles.authForm} w-full max-w-[38rem] text-center`}>
          <p className="mb-3 text-[0.72rem] font-medium tracking-[0.08em] text-primary sm:hidden">Step 1 of 2</p>
          <h1 className="text-balance text-[2.5rem] font-semibold leading-[1.02] tracking-[-0.05em] text-white sm:text-[3.55rem]">Set up your observation deck.</h1>
          <p className="mx-auto mt-5 max-w-[33rem] text-pretty text-[0.98rem] leading-7 text-blue-100/66 sm:text-[1.05rem]">Create the first administrator who will configure monitors, members, and notifications.</p>
          {error ? <div className="mx-auto mt-6 max-w-[30rem]"><FormError message={error} /></div> : null}
          <div className="mx-auto mt-8 max-w-[22rem]">
            <Button type="button" size="lg" disabled={!ready} onClick={onGetStarted} className="h-[3.375rem] w-full rounded-[9px] bg-primary text-[0.95rem] font-semibold text-[#031312] shadow-[0_12px_34px_rgba(45,212,191,0.18)] transition-[background-color,box-shadow] duration-150 hover:bg-[#5eead4] hover:shadow-[0_16px_40px_rgba(45,212,191,0.24)] focus-visible:ring-primary/50">
              {ready ? <><span>Begin setup</span><ArrowRight aria-hidden="true" data-icon="inline-end" /></> : <><LoaderCircle aria-hidden="true" data-icon="inline-start" className="animate-spin motion-reduce:animate-none" />Checking workspace…</>}
            </Button>
          </div>
        </div>
      </section>
    </ObservatoryShell>
  );
}

async function handleReadinessResponse(response: Response, isActive: () => boolean, redirectToLogin: (href: string) => void, setReady: (ready: boolean) => void, setError: (error: string | null) => void) {
  const data = (await response.json().catch(() => null)) as { required?: boolean; message?: string } | null;
  if (!isActive()) return;
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

function AdminForm({ busy, error, fieldErrors, formRef, ready, showConfirmPassword, showPassword, onFieldInput, onSubmit, onToggleConfirmPassword, onTogglePassword }: {
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
    <form ref={formRef} aria-busy={busy} aria-labelledby="administrator-title" className="flex flex-col gap-4" onInput={(event) => handleFieldInput(event, onFieldInput)} onSubmit={onSubmit}>
      <div className="grid gap-x-3 gap-y-3 min-[360px]:grid-cols-2 sm:gap-x-4 sm:gap-y-4">
        <FieldBlock label="First name" htmlFor="firstName" error={fieldErrors.firstName}><Input id="firstName" name="firstName" autoComplete="given-name" required disabled={!ready} aria-invalid={Boolean(fieldErrors.firstName)} aria-describedby={fieldErrors.firstName ? fieldErrorId("firstName") : undefined} placeholder="First name" className={inputClassName} /></FieldBlock>
        <FieldBlock label="Last name" htmlFor="lastName" error={fieldErrors.lastName}><Input id="lastName" name="lastName" autoComplete="family-name" required disabled={!ready} aria-invalid={Boolean(fieldErrors.lastName)} aria-describedby={fieldErrors.lastName ? fieldErrorId("lastName") : undefined} placeholder="Last name" className={inputClassName} /></FieldBlock>
        <FieldBlock label="Username" htmlFor="username" error={fieldErrors.username}><Input id="username" name="username" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} required disabled={!ready} aria-invalid={Boolean(fieldErrors.username)} aria-describedby={fieldErrors.username ? fieldErrorId("username") : undefined} placeholder="Username" className={inputClassName} /></FieldBlock>
        <FieldBlock label="Email" htmlFor="email" error={fieldErrors.email}><Input id="email" name="email" type="email" autoComplete="email" spellCheck={false} required disabled={!ready} aria-invalid={Boolean(fieldErrors.email)} aria-describedby={fieldErrors.email ? fieldErrorId("email") : undefined} placeholder="Email address" className={inputClassName} /></FieldBlock>
        <PasswordField id="password" label="Password" error={fieldErrors.password} visible={showPassword} onToggle={onTogglePassword} disabled={!ready} />
        <PasswordField id="confirmPassword" label="Confirm password" error={fieldErrors.confirmPassword} visible={showConfirmPassword} onToggle={onToggleConfirmPassword} disabled={!ready} />
      </div>
      <p id="password-requirements" className="text-[0.76rem] leading-5 text-blue-100/48">Use 12–128 characters with uppercase, lowercase, a number, and a special character.</p>
      {error ? <FormError message={error} /> : null}
      <Button type="submit" size="lg" disabled={!ready || busy} className="h-[3.375rem] w-full rounded-[9px] bg-primary text-[0.95rem] font-semibold text-[#031312] shadow-[0_12px_34px_rgba(45,212,191,0.18)] transition-[background-color,box-shadow] duration-150 hover:bg-[#5eead4] hover:shadow-[0_16px_40px_rgba(45,212,191,0.24)] focus-visible:ring-primary/50">
        {busy ? <><LoaderCircle aria-hidden="true" data-icon="inline-start" className="animate-spin motion-reduce:animate-none" />Creating administrator…</> : <>Create administrator<ArrowRight aria-hidden="true" data-icon="inline-end" /></>}
      </Button>
    </form>
  );
}

function PasswordField({ id, label, error, visible, disabled, onToggle }: { id: "password" | "confirmPassword"; label: string; error?: string; visible: boolean; disabled: boolean; onToggle: () => void; }) {
  return (
    <FieldBlock label={label} htmlFor={id} error={error}>
      <div className="relative">
        <Input id={id} name={id} type={visible ? "text" : "password"} autoComplete="new-password" minLength={12} maxLength={128} required disabled={disabled} aria-invalid={Boolean(error)} aria-describedby={[error ? fieldErrorId(id) : null, id === "password" ? "password-requirements" : null].filter(Boolean).join(" ") || undefined} placeholder={id === "password" ? "12+ characters" : "Repeat password"} className={cn(inputClassName, "pr-11")} />
        <Button type="button" variant="ghost" size="icon" onClick={onToggle} disabled={disabled} className="absolute right-1 top-1/2 size-10 -translate-y-1/2 rounded-md text-blue-100/50 hover:bg-blue-100/8 hover:text-white focus-visible:ring-primary/35" aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`} aria-pressed={visible}>{visible ? <Eye /> : <EyeOff />}</Button>
      </div>
    </FieldBlock>
  );
}

async function submitOnboardingForm(form: HTMLFormElement) {
  return fetch("/api/auth/onboarding", { method: "POST", cache: "no-store", credentials: "same-origin", referrerPolicy: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(readOnboardingPayload(form)) });
}

function readOnboardingPayload(form: HTMLFormElement) {
  const formData = new FormData(form);
  return { firstName: String(formData.get("firstName") ?? ""), lastName: String(formData.get("lastName") ?? ""), username: String(formData.get("username") ?? ""), email: String(formData.get("email") ?? ""), password: String(formData.get("password") ?? ""), confirmPassword: String(formData.get("confirmPassword") ?? "") };
}

function clearPasswordFields(form: HTMLFormElement | null) {
  if (!form) return;
  for (const name of ["password", "confirmPassword"]) {
    const input = form.elements.namedItem(name);
    if (input instanceof HTMLInputElement) input.value = "";
  }
}

function parseOnboardingFieldErrors(value: unknown): OnboardingFieldErrors {
  if (!value || typeof value !== "object") return {};
  const fieldErrors: OnboardingFieldErrors = {};
  for (const field of onboardingFieldNames) {
    const message = (value as Record<string, unknown>)[field];
    if (typeof message === "string" && message.length > 0) fieldErrors[field] = message;
  }
  return fieldErrors;
}

function hasFieldErrors(fieldErrors: OnboardingFieldErrors) { return onboardingFieldNames.some((field) => Boolean(fieldErrors[field])); }

function focusFirstInvalidField(form: HTMLFormElement | null, fieldErrors: OnboardingFieldErrors) {
  const firstInvalidField = onboardingFieldNames.find((field) => fieldErrors[field]);
  const input = firstInvalidField ? form?.elements.namedItem(firstInvalidField) : null;
  if (input instanceof HTMLInputElement) input.focus();
}

function handleFieldInput(event: React.FormEvent<HTMLFormElement>, onFieldInput: (field: OnboardingFieldName) => void) {
  const target = event.target;
  if (target instanceof HTMLInputElement && onboardingFieldNames.includes(target.name as OnboardingFieldName)) onFieldInput(target.name as OnboardingFieldName);
}

function clearFieldError(fieldErrors: OnboardingFieldErrors, field: OnboardingFieldName) {
  if (!fieldErrors[field]) return fieldErrors;
  const nextFieldErrors = { ...fieldErrors };
  delete nextFieldErrors[field];
  return nextFieldErrors;
}

function fieldErrorId(field: OnboardingFieldName) { return `${field}-error`; }

function FormError({ message }: { message: string }) {
  return <div role="alert" aria-live="assertive" className="rounded-[9px] border border-red-400/25 bg-red-950/65 px-4 py-3 text-sm leading-5 text-red-100 backdrop-blur-sm">{message}</div>;
}

function FieldBlock({ label, htmlFor, error, children }: { label: string; htmlFor: OnboardingFieldName; error?: string; children: React.ReactNode; }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={htmlFor} className="text-[0.8rem] font-medium text-blue-50/80">{label}</Label>
      {children}
      {error ? <p id={fieldErrorId(htmlFor)} role="alert" className="text-[0.75rem] leading-4 text-red-300">{error}</p> : null}
    </div>
  );
}
