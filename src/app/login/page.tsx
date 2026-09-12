"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  ArrowRight,
  AtSign,
  Eye,
  EyeOff,
  LockKeyhole,
  LoaderCircle,
} from "lucide-react";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resolveSafeAuthRedirect } from "@/lib/auth/redirect";
import { cn } from "@/lib/utils";

const inputClassName =
  "h-[3.375rem] rounded-[9px] border-blue-200/25 bg-[#091426]/78 px-4 text-base text-white shadow-[inset_0_1px_rgba(255,255,255,0.025),0_14px_36px_rgba(0,0,0,0.12)] backdrop-blur-[2px] transition-[border-color,background-color,box-shadow] duration-150 placeholder:text-blue-100/38 hover:border-blue-100/40 focus-visible:border-primary/85 focus-visible:bg-[#0a172b]/90 focus-visible:ring-2 focus-visible:ring-primary/25";

export default function LoginPage() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [isNavigating, startTransition] = useTransition();
  const busy = submitting || isNavigating;

  useEffect(() => {
    let active = true;

    void fetch("/api/auth/onboarding", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          return;
        }

        const data = (await response.json()) as { required?: boolean };
        if (active && data.required) {
          router.replace("/onboarding");
        }
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, [router]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    const formData = new FormData(event.currentTarget);
    const payload = {
      identifier: String(formData.get("identifier") ?? ""),
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
          ? resolveSafeAuthRedirect(new URLSearchParams(window.location.search).get("next"))
          : "/dashboard";

      startTransition(() => {
        router.replace(nextPath === "/dashboard" ? "/" : nextPath);
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
      formTitle="Welcome back"
      formDescription="Sign in to your Sentrovia workspace."
    >
      <form ref={formRef} className="flex flex-col gap-5" onSubmit={handleSubmit} aria-describedby={error ? "login-error" : undefined}>
        <FieldBlock label="Email or username" htmlFor="identifier">
          <div className="relative">
            <AtSign aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 z-10 size-[1.05rem] -translate-y-1/2 text-blue-100/45" />
            <Input
              id="identifier"
              name="identifier"
              type="text"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              required
              placeholder="name@company.com"
              className={cn(inputClassName, "pl-11")}
              aria-invalid={Boolean(error)}
            />
          </div>
        </FieldBlock>

        <FieldBlock label="Password" htmlFor="password">
          <div className="relative">
            <LockKeyhole aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 z-10 size-[1.05rem] -translate-y-1/2 text-blue-100/45" />
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
              className={cn(inputClassName, "pl-11 pr-12")}
              aria-invalid={Boolean(error)}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => setShowPassword((value) => !value)}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md text-blue-100/55 transition-colors hover:bg-blue-100/8 hover:text-white focus-visible:ring-primary/35"
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-pressed={showPassword}
            >
              {showPassword ? <Eye /> : <EyeOff />}
            </Button>
          </div>
        </FieldBlock>

        {error ? (
          <div
            id="login-error"
            role="alert"
            aria-live="assertive"
            className="rounded-[9px] border border-red-400/25 bg-red-950/65 px-4 py-3.5 text-sm leading-5 text-red-100 backdrop-blur-sm"
          >
            {error}
          </div>
        ) : null}

        <Button
          type="submit"
          size="lg"
          disabled={busy}
          className="mt-1 h-[3.375rem] rounded-[9px] bg-primary text-[0.95rem] font-semibold text-[#031312] shadow-[0_12px_34px_rgba(45,212,191,0.18)] transition-[background-color,box-shadow] duration-150 hover:bg-[#5eead4] hover:shadow-[0_16px_40px_rgba(45,212,191,0.24)] focus-visible:ring-primary/50"
        >
          {busy ? (
            <>
              <LoaderCircle data-icon="inline-start" className="animate-spin" />
              Signing in
            </>
          ) : (
            <>
              Sign in
              <ArrowRight aria-hidden="true" data-icon="inline-end" />
            </>
          )}
        </Button>

        <p className="pt-0.5 text-center text-[0.82rem] leading-5 text-blue-100/50">
          Trouble signing in? <span className="text-blue-50/72">Contact your workspace administrator.</span>
        </p>
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
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={htmlFor} className="text-[0.82rem] font-medium text-blue-50/82">{label}</Label>
      {children}
    </div>
  );
}
