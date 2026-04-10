"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import {
  ArrowRight,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  Shield,
  TimerReset,
} from "lucide-react";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const inputClassName =
  "h-12 rounded-xl border-border/80 bg-surface-low/80 text-foreground placeholder:text-muted-foreground/70 focus-visible:border-primary/60 focus-visible:ring-primary/20";

export default function LoginPage() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [showPassword, setShowPassword] = useState(false);
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
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
    };

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        cache: "no-store",
        credentials: "same-origin",
        referrerPolicy: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = (await response.json().catch(() => null)) as { message?: string } | null;

      if (!response.ok) {
        clearPasswordFields(formRef.current);
        setError(data?.message ?? "Unable to sign in with those credentials.");
        return;
      }

      clearPasswordFields(formRef.current);
      const nextPath =
        typeof window !== "undefined"
          ? new URLSearchParams(window.location.search).get("next") || "/dashboard"
          : "/dashboard";

      startTransition(() => {
        router.replace(nextPath);
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
    <AuthShell
      tone="primary"
      heroTitle="Enter the Sentrovia command surface with a quieter, tighter auth flow."
      heroDescription="Access monitor operations, delivery controls, event analysis, and worker visibility from the same focused reliability workspace."
      showcaseCards={[
        {
          icon: Shield,
          title: "Hardened Session Flow",
          description: "Signed cookies, strict same-site rules, and rate-limited auth requests.",
          meta: "SECURITY FIRST",
        },
        {
          icon: TimerReset,
          title: "Operational Continuity",
          description: "Resume directly into dashboards, logs, delivery controls, and worker status.",
          meta: "FAST REENTRY",
        },
        {
          icon: KeyRound,
          title: "Credential Discipline",
          description: "Passwords never persist in plain storage and failed attempts are throttled.",
          meta: "AUTH GUARDRAILS",
        },
      ]}
      stats={[
        { label: "Session Window", value: "7d", detail: "Signed server session lifetime" },
        { label: "Auth Control", value: "Strict", detail: "No-store auth responses" },
        { label: "Operator View", value: "Live", detail: "Dashboard route continuation" },
      ]}
      formEyebrow="Sign In"
      formTitle="Open the Sentrovia workspace"
      formDescription="Use your registered operator email and password to continue into the monitoring console."
      footerPrompt="Need an account?"
      footerHref="/signup"
      footerLabel="Create one here"
    >
      <form ref={formRef} className="flex flex-col gap-5" onSubmit={handleSubmit}>
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
          label="Password"
          htmlFor="password"
          aside={<span className="text-[11px] text-muted-foreground">Case-sensitive</span>}
        >
          <div className="relative">
            <Input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              minLength={12}
              maxLength={128}
              required
              placeholder="Enter your password"
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

        {error ? (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive-foreground">
            {error}
          </div>
        ) : null}

        <Button type="submit" size="lg" disabled={busy} className="h-12 rounded-xl">
          {busy ? (
            <>
              <LoaderCircle data-icon="inline-start" className="animate-spin" />
              Signing in
            </>
          ) : (
            <>
              Continue to Dashboard
              <ArrowRight data-icon="inline-end" />
            </>
          )}
        </Button>
      </form>
    </AuthShell>
  );
}

function clearPasswordFields(form: HTMLFormElement | null) {
  if (!form) {
    return;
  }

  const passwordInput = form.elements.namedItem("password");
  if (passwordInput instanceof HTMLInputElement) {
    passwordInput.value = "";
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
