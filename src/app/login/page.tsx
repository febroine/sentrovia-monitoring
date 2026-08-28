"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  Eye,
  EyeOff,
  LoaderCircle,
} from "lucide-react";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resolveSafeAuthRedirect } from "@/lib/auth/redirect";
import { cn } from "@/lib/utils";

const inputClassName =
  "h-12 rounded-md border-white/10 bg-[#090a0c] px-3.5 text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] transition-[border-color,background-color,box-shadow] duration-150 placeholder:text-zinc-600 hover:border-white/15 focus-visible:border-primary/70 focus-visible:bg-[#0b0c0e] focus-visible:ring-2 focus-visible:ring-primary/20";

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
      formTitle="Sign in"
      formDescription="Use your workspace email or username to continue."
    >
      <form ref={formRef} className="flex flex-col gap-5" onSubmit={handleSubmit} aria-describedby={error ? "login-error" : undefined}>
        <FieldBlock label="Email or username" htmlFor="identifier">
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
            className={inputClassName}
            aria-invalid={Boolean(error)}
          />
        </FieldBlock>

        <FieldBlock label="Password" htmlFor="password">
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
              aria-invalid={Boolean(error)}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => setShowPassword((value) => !value)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm text-zinc-500 transition-colors hover:bg-white/[0.05] hover:text-zinc-200"
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
            className="rounded-sm border border-red-500/25 bg-red-500/[0.06] px-3.5 py-3 text-sm leading-5 text-red-200"
          >
            {error}
          </div>
        ) : null}

        <Button
          type="submit"
          size="lg"
          disabled={busy}
          className="h-12 rounded-md bg-primary font-semibold shadow-[0_1px_0_rgba(255,255,255,0.12)_inset,0_8px_24px_rgba(79,70,229,0.16)] transition-[background-color,transform,box-shadow] duration-150 hover:bg-primary/90 hover:shadow-[0_1px_0_rgba(255,255,255,0.12)_inset,0_10px_28px_rgba(79,70,229,0.22)] active:translate-y-px active:shadow-[0_1px_0_rgba(255,255,255,0.08)_inset]"
        >
          {busy ? (
            <>
              <LoaderCircle data-icon="inline-start" className="animate-spin" />
              Signing in
            </>
          ) : (
            <>
              Sign in
            </>
          )}
        </Button>

        <p className="pt-1 text-center text-xs leading-5 text-zinc-500">
          Trouble signing in? <span className="text-zinc-300">Contact your workspace administrator.</span>
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
      <Label htmlFor={htmlFor} className="text-[0.78rem] font-medium text-zinc-300">{label}</Label>
      {children}
    </div>
  );
}
