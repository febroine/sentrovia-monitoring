"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Eye, EyeOff, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SentroviaMark } from "@/components/brand/sentrovia-mark";
import { cn } from "@/lib/utils";

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
  "h-10 rounded-md border-white/10 bg-background px-3 text-zinc-100 placeholder:text-zinc-400 transition-[border-color,background-color,box-shadow] duration-150 hover:border-white/15 focus-visible:border-primary/70 focus-visible:bg-surface-low focus-visible:ring-primary/20";

export default function OnboardingPage() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
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
    <main className="min-h-svh bg-background text-foreground">
      <header className="border-b border-border px-5 py-4 sm:px-8">
        <div className="mx-auto flex w-full max-w-2xl items-center gap-3">
          <SentroviaMark className="size-7" />
          <p className="text-sm font-semibold tracking-[-0.02em]">Sentrovia</p>
        </div>
      </header>
      <div className="px-5 py-8 sm:px-8 sm:py-12">
        <section className="mx-auto w-full max-w-2xl">
          <h1 className="text-2xl font-semibold tracking-tight">Create administrator</h1>
          <p className="mt-2 text-sm text-muted-foreground">This account can manage monitors, members, and notification settings.</p>
          <div className="mt-7 border-t pt-6">
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
      aria-busy={busy}
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
      <div className="flex flex-col-reverse items-stretch gap-3 border-t border-white/[0.08] pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="hidden text-[13px] text-zinc-400 sm:block">You will be signed in after this step.</p>
        <Button type="submit" size="lg" disabled={!ready || busy} className="h-10 rounded-md bg-primary px-4 font-semibold text-primary-foreground transition-colors duration-150 hover:bg-primary/90 focus-visible:border-ring focus-visible:ring-ring/40">
          {busy ? (
            <>
              <LoaderCircle data-icon="inline-start" className="animate-spin motion-reduce:animate-none" />
              Creating administratorÃ¢â‚¬Â¦
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
          <Input id="firstName" name="firstName" autoComplete="given-name" required disabled={!ready} aria-invalid={Boolean(fieldErrors.firstName)} aria-describedby={fieldErrors.firstName ? fieldErrorId("firstName") : undefined} placeholder="Enter your first name" className={inputClassName} />
        </FieldBlock>
        <FieldBlock label="Last name" htmlFor="lastName" error={fieldErrors.lastName}>
          <Input id="lastName" name="lastName" autoComplete="family-name" required disabled={!ready} aria-invalid={Boolean(fieldErrors.lastName)} aria-describedby={fieldErrors.lastName ? fieldErrorId("lastName") : undefined} placeholder="Enter your last name" className={inputClassName} />
        </FieldBlock>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <FieldBlock label="Username" htmlFor="username" error={fieldErrors.username}>
          <Input id="username" name="username" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} required disabled={!ready} aria-invalid={Boolean(fieldErrors.username)} aria-describedby={fieldErrors.username ? fieldErrorId("username") : undefined} placeholder="Choose a username" className={inputClassName} />
        </FieldBlock>
        <FieldBlock label="Email" htmlFor="email" error={fieldErrors.email}>
          <Input id="email" name="email" type="email" autoComplete="email" spellCheck={false} required disabled={!ready} aria-invalid={Boolean(fieldErrors.email)} aria-describedby={fieldErrors.email ? fieldErrorId("email") : undefined} placeholder="Enter your email address" className={inputClassName} />
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
        <Button type="button" variant="ghost" size="icon-sm" onClick={onToggle} disabled={disabled} className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-sm text-zinc-400 hover:bg-white/[0.05] hover:text-zinc-100 focus-visible:ring-primary/30" aria-label={visible ? "Hide password" : "Show password"}>
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
    <div role="alert" aria-live="polite" className="border-l-2 border-destructive px-4 py-2 text-sm leading-6 text-red-200">
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
      <Label htmlFor={htmlFor} className="text-[13px] font-medium text-zinc-300">
        {label}
      </Label>
      {children}
      {error ? (
        <p id={fieldErrorId(htmlFor)} role="alert" className="text-[13px] leading-5 text-red-300">
          {error}
        </p>
      ) : null}
    </div>
  );
}
