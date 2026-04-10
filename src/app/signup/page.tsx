"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import {
  ArrowRight,
  Eye,
  EyeOff,
  LoaderCircle,
  ShieldCheck,
  UserPlus2,
  UsersRound,
} from "lucide-react";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const inputClassName =
  "h-12 rounded-xl border-border/80 bg-surface-low/80 text-foreground placeholder:text-muted-foreground/70 focus-visible:border-primary/60 focus-visible:ring-primary/20";

export default function SignupPage() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [isNavigating, startTransition] = useTransition();
  const busy = submitting || isNavigating;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    const formData = new FormData(event.currentTarget);
    const payload = {
      firstName: String(formData.get("firstName") ?? ""),
      lastName: String(formData.get("lastName") ?? ""),
      email: String(formData.get("email") ?? ""),
      department: String(formData.get("department") ?? ""),
      password: String(formData.get("password") ?? ""),
      confirmPassword: String(formData.get("confirmPassword") ?? ""),
    };

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        cache: "no-store",
        credentials: "same-origin",
        referrerPolicy: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = (await response.json().catch(() => null)) as { message?: string } | null;

      if (!response.ok) {
        clearSignupPasswords(formRef.current);
        setError(data?.message ?? "Unable to create your account right now.");
        return;
      }

      clearSignupPasswords(formRef.current);

      startTransition(() => {
        router.replace("/dashboard");
        router.refresh();
      });
    } catch {
      clearSignupPasswords(formRef.current);
      setError("Connection failed. Please try again in a moment.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      tone="emerald"
      heroTitle="Create a Sentrovia operator identity for day-to-day monitoring work."
      heroDescription="Provision access once, then move directly into dashboards, delivery operations, event review, and verification-aware incident handling."
      showcaseCards={[
        {
          icon: UserPlus2,
          title: "Fast Provisioning",
          description: "Create an operator record and enter the workspace in a single secure pass.",
          meta: "ONE STEP ENTRY",
        },
        {
          icon: ShieldCheck,
          title: "Session Integrity",
          description: "Registration immediately issues a signed server session with strict cookie rules.",
          meta: "SIGNED ACCESS",
        },
        {
          icon: UsersRound,
          title: "Shared Visibility",
          description: "New accounts land inside the same operational surface as the existing team.",
          meta: "TEAM READY",
        },
      ]}
      stats={[
        { label: "Password Policy", value: "12+", detail: "Length with mixed character classes" },
        { label: "Auth Guard", value: "Limited", detail: "Registration attempts are throttled" },
        { label: "Workspace Entry", value: "Instant", detail: "Session starts after registration" },
      ]}
      formEyebrow="Register"
      formTitle="Create your Sentrovia account"
      formDescription="Set up an operator profile for monitor management, incident review, delivery testing, and operational reporting."
      footerPrompt="Already have an account?"
      footerHref="/login"
      footerLabel="Sign in instead"
    >
      <form ref={formRef} className="flex flex-col gap-5" onSubmit={handleSubmit}>
        <div className="grid gap-4 sm:grid-cols-2">
          <FieldBlock label="First Name" htmlFor="firstName">
            <Input
              id="firstName"
              name="firstName"
              autoComplete="given-name"
              required
              placeholder="Aykut"
              className={inputClassName}
            />
          </FieldBlock>
          <FieldBlock label="Last Name" htmlFor="lastName">
            <Input
              id="lastName"
              name="lastName"
              autoComplete="family-name"
              required
              placeholder="Bayram"
              className={inputClassName}
            />
          </FieldBlock>
        </div>

        <FieldBlock label="Email" htmlFor="email">
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            required
            placeholder="name@company.com"
            className={inputClassName}
          />
        </FieldBlock>

        <FieldBlock
          label="Department"
          htmlFor="department"
          aside={<span className="text-[11px] text-muted-foreground">Optional</span>}
        >
          <Input
            id="department"
            name="department"
            autoComplete="organization-title"
            placeholder="Engineering, SRE, DevOps"
            className={inputClassName}
          />
        </FieldBlock>

        <div className="grid gap-4 sm:grid-cols-2">
          <FieldBlock label="Password" htmlFor="password">
            <div className="relative">
              <Input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                minLength={12}
                maxLength={128}
                required
                placeholder="Minimum 12 characters"
                className={cn(inputClassName, "pr-12")}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => setShowPassword((value) => !value)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-xl text-muted-foreground hover:bg-muted/70 hover:text-foreground"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <Eye /> : <EyeOff />}
              </Button>
            </div>
          </FieldBlock>

          <FieldBlock label="Confirm Password" htmlFor="confirmPassword">
            <div className="relative">
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type={showConfirmPassword ? "text" : "password"}
                autoComplete="new-password"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                minLength={12}
                maxLength={128}
                required
                placeholder="Repeat your password"
                className={cn(inputClassName, "pr-12")}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => setShowConfirmPassword((value) => !value)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-xl text-muted-foreground hover:bg-muted/70 hover:text-foreground"
                aria-label={showConfirmPassword ? "Hide password" : "Show password"}
              >
                {showConfirmPassword ? <Eye /> : <EyeOff />}
              </Button>
            </div>
          </FieldBlock>
        </div>

        {error ? (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive-foreground">
            {error}
          </div>
        ) : null}

        <Button type="submit" size="lg" disabled={busy} className="h-12 rounded-xl">
          {busy ? (
            <>
              <LoaderCircle data-icon="inline-start" className="animate-spin" />
              Creating account
            </>
          ) : (
            <>
              Create Account
              <ArrowRight data-icon="inline-end" />
            </>
          )}
        </Button>
      </form>
    </AuthShell>
  );
}

function clearSignupPasswords(form: HTMLFormElement | null) {
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
        <Label
          htmlFor={htmlFor}
          className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground"
        >
          {label}
        </Label>
        {aside}
      </div>
      {children}
    </div>
  );
}
