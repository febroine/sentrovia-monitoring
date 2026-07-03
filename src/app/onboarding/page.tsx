"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { ArrowRight, CheckCircle2, Database, Eye, EyeOff, LoaderCircle, LockKeyhole, ShieldCheck, UsersRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const inputClassName =
  "h-11 rounded-lg border-border/80 bg-surface-low/80 text-foreground placeholder:text-muted-foreground/70 focus-visible:border-primary/60 focus-visible:ring-primary/20";

const setupItems = [
  { icon: ShieldCheck, label: "Administrator", value: "Required" },
  { icon: UsersRound, label: "Member Access", value: "Admin-managed" },
  { icon: LockKeyhole, label: "Signup", value: "Closed" },
  { icon: Database, label: "Setup Source", value: "Users table" },
];

export default function OnboardingPage() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
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
      .then(async (response) => {
        const data = (await response.json().catch(() => null)) as { required?: boolean; message?: string } | null;
        if (!active) {
          return;
        }

        if (!response.ok) {
          setError(data?.message ?? "Unable to check workspace setup.");
          setReady(true);
          return;
        }

        if (!data?.required) {
          router.replace("/login");
          return;
        }

        setReady(true);
      })
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

    const formData = new FormData(event.currentTarget);
    const payload = {
      firstName: String(formData.get("firstName") ?? ""),
      lastName: String(formData.get("lastName") ?? ""),
      username: String(formData.get("username") ?? ""),
      email: String(formData.get("email") ?? ""),
      department: String(formData.get("department") ?? ""),
      password: String(formData.get("password") ?? ""),
      confirmPassword: String(formData.get("confirmPassword") ?? ""),
    };

    try {
      const response = await fetch("/api/auth/onboarding", {
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
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-8 px-4 py-6 sm:px-6 lg:px-8">
        <OnboardingHeader />

        <section className="grid flex-1 items-center gap-6 lg:grid-cols-[minmax(280px,380px)_minmax(0,1fr)]">
          <SetupPanel />

          <Card className="border-border/80 bg-card/95 shadow-sm">
            <CardHeader className="gap-3 border-b border-border/70">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-2xl tracking-tight">Create first user</CardTitle>
                  <CardDescription>This account will receive administrator permissions.</CardDescription>
                </div>
                <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
                  Setup
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              <form ref={formRef} className="flex flex-col gap-5" onSubmit={handleSubmit}>
                <AdminIdentityFields ready={ready} />

                <div className="grid gap-4 sm:grid-cols-2">
                  <PasswordField
                    id="password"
                    label="Password"
                    visible={showPassword}
                    onToggle={() => setShowPassword((value) => !value)}
                    disabled={!ready}
                  />
                  <PasswordField
                    id="confirmPassword"
                    label="Confirm Password"
                    visible={showConfirmPassword}
                    onToggle={() => setShowConfirmPassword((value) => !value)}
                    disabled={!ready}
                  />
                </div>

                {error ? <FormError message={error} /> : null}

                <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <Button type="button" variant="ghost" onClick={() => router.replace("/login")} className="justify-center sm:justify-start">
                    Go to login
                  </Button>
                  <Button type="submit" size="lg" disabled={!ready || busy} className="h-11 rounded-lg">
                    {busy ? (
                      <>
                        <LoaderCircle data-icon="inline-start" className="animate-spin" />
                        Creating user
                      </>
                    ) : (
                      <>
                        Create First User
                        <ArrowRight data-icon="inline-end" />
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}

function OnboardingHeader() {
  return (
    <header className="flex items-center justify-between gap-4 border-b border-border/70 pb-5">
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-lg border border-border/80 bg-card">
          <ShieldCheck className="size-5 text-emerald-400" />
        </div>
        <div>
          <p className="text-sm font-semibold tracking-tight">Sentrovia</p>
          <p className="text-xs text-muted-foreground">Workspace initialization</p>
        </div>
      </div>
      <Badge variant="outline" className="hidden border-border/80 bg-muted/30 text-muted-foreground sm:inline-flex">
        Admin setup
      </Badge>
    </header>
  );
}

function SetupPanel() {
  return (
    <Card className="border-border/80 bg-card/80 shadow-sm">
      <CardHeader>
        <CardTitle className="text-xl tracking-tight">Initial access</CardTitle>
        <CardDescription>Database has no workspace users.</CardDescription>
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
          <span>Ready for first administrator</span>
        </div>
      </CardContent>
    </Card>
  );
}

function AdminIdentityFields({ ready }: { ready: boolean }) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <FieldBlock label="First Name" htmlFor="firstName">
          <Input id="firstName" name="firstName" autoComplete="given-name" required disabled={!ready} placeholder="Enter first name" className={inputClassName} />
        </FieldBlock>
        <FieldBlock label="Last Name" htmlFor="lastName">
          <Input id="lastName" name="lastName" autoComplete="family-name" required disabled={!ready} placeholder="Enter last name" className={inputClassName} />
        </FieldBlock>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <FieldBlock label="Username" htmlFor="username">
          <Input
            id="username"
            name="username"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            required
            disabled={!ready}
            placeholder="aykut.bayram"
            className={inputClassName}
          />
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
        <Input
          id={id}
          name={id}
          type={visible ? "text" : "password"}
          autoComplete="new-password"
          minLength={12}
          maxLength={128}
          required
          disabled={disabled}
          placeholder={id === "password" ? "Minimum 12 characters" : "Repeat password"}
          className={cn(inputClassName, "pr-12")}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onToggle}
          disabled={disabled}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-lg text-muted-foreground hover:bg-muted/70 hover:text-foreground"
          aria-label={visible ? "Hide password" : "Show password"}
        >
          {visible ? <Eye /> : <EyeOff />}
        </Button>
      </div>
    </FieldBlock>
  );
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
        <Label htmlFor={htmlFor} className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          {label}
        </Label>
        {aside}
      </div>
      {children}
    </div>
  );
}
