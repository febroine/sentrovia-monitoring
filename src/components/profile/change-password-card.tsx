"use client";

import { useRef, useState } from "react";
import { Eye, EyeOff, KeyRound, LoaderCircle, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const passwordInputClassName =
  "h-11 rounded-xl border-border/80 bg-surface-low/70 text-foreground placeholder:text-muted-foreground/70 focus-visible:border-primary/60 focus-visible:ring-primary/20";

type PasswordFieldName = "currentPassword" | "newPassword" | "confirmPassword";

export function ChangePasswordCard() {
  const formRef = useRef<HTMLFormElement>(null);
  const [showValues, setShowValues] = useState<Record<PasswordFieldName, boolean>>({
    currentPassword: false,
    newPassword: false,
    confirmPassword: false,
  });
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage(null);
    setError(null);

    const formData = new FormData(event.currentTarget);
    const payload = {
      currentPassword: String(formData.get("currentPassword") ?? ""),
      newPassword: String(formData.get("newPassword") ?? ""),
      confirmPassword: String(formData.get("confirmPassword") ?? ""),
    };

    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        credentials: "same-origin",
        referrerPolicy: "same-origin",
        body: JSON.stringify(payload),
      });
      const data = (await response.json().catch(() => null)) as { message?: string } | null;

      if (!response.ok) {
        clearPasswordFields(formRef.current);
        setError(data?.message ?? "Unable to change your password right now.");
        return;
      }

      clearPasswordFields(formRef.current);
      setMessage(data?.message ?? "Password updated successfully.");
    } catch {
      clearPasswordFields(formRef.current);
      setError("Connection failed. Please try again in a moment.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b bg-muted/20 pb-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-primary" />
              Change Password
            </CardTitle>
            <CardDescription>
              Confirm your current password, then set a new one with at least 12 characters and a
              full character mix.
            </CardDescription>
          </div>
          <div className="hidden rounded-2xl border bg-background px-3 py-2 text-xs text-muted-foreground sm:block">
            Signed session stays active
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5 p-6">
        <div className="rounded-2xl border border-emerald-500/15 bg-emerald-500/[0.05] px-4 py-3 text-sm text-muted-foreground">
          <div className="flex items-center gap-2 font-medium text-foreground">
            <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            Password policy
          </div>
          <p className="mt-2 leading-6">
            New passwords must include uppercase, lowercase, number, and special character support.
          </p>
        </div>

        <form ref={formRef} className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <PasswordField
            name="currentPassword"
            label="Current password"
            placeholder="Enter your current password"
            minLength={1}
            visible={showValues.currentPassword}
            onToggle={() => toggleField("currentPassword", setShowValues)}
          />
          <div className="grid gap-4 lg:grid-cols-2">
            <PasswordField
              name="newPassword"
              label="New password"
              placeholder="Minimum 12 characters"
              minLength={12}
              visible={showValues.newPassword}
              onToggle={() => toggleField("newPassword", setShowValues)}
            />
            <PasswordField
              name="confirmPassword"
              label="Confirm new password"
              placeholder="Repeat the new password"
              minLength={12}
              visible={showValues.confirmPassword}
              onToggle={() => toggleField("confirmPassword", setShowValues)}
            />
          </div>

          {error ? (
            <Banner tone="error">{error}</Banner>
          ) : null}
          {message ? (
            <Banner tone="success">{message}</Banner>
          ) : null}

          <div className="flex justify-end">
            <Button type="submit" disabled={submitting} className="min-w-40 rounded-xl">
              {submitting ? (
                <>
                  <LoaderCircle data-icon="inline-start" className="animate-spin" />
                  Updating
                </>
              ) : (
                "Update Password"
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function PasswordField({
  name,
  label,
  placeholder,
  minLength,
  visible,
  onToggle,
}: {
  name: PasswordFieldName;
  label: string;
  placeholder: string;
  minLength: number;
  visible: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={name} className="text-sm">
        {label}
      </Label>
      <div className="relative">
        <Input
          id={name}
          name={name}
          type={visible ? "text" : "password"}
          autoComplete={name === "currentPassword" ? "current-password" : "new-password"}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          minLength={minLength}
          maxLength={128}
          required
          placeholder={placeholder}
          className={cn(passwordInputClassName, "pr-12")}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onToggle}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-xl text-muted-foreground hover:bg-muted/70 hover:text-foreground"
          aria-label={visible ? `Hide ${label}` : `Show ${label}`}
        >
          {visible ? <Eye /> : <EyeOff />}
        </Button>
      </div>
    </div>
  );
}

function Banner({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "error" | "success";
}) {
  const className =
    tone === "error"
      ? "border-destructive/25 bg-destructive/10 text-destructive"
      : "border-emerald-500/20 bg-emerald-500/[0.08] text-emerald-700 dark:text-emerald-400";

  return <div className={cn("rounded-2xl border px-4 py-3 text-sm", className)}>{children}</div>;
}

function toggleField(
  field: PasswordFieldName,
  setState: React.Dispatch<React.SetStateAction<Record<PasswordFieldName, boolean>>>
) {
  setState((current) => ({
    ...current,
    [field]: !current[field],
  }));
}

function clearPasswordFields(form: HTMLFormElement | null) {
  if (!form) {
    return;
  }

  for (const fieldName of ["currentPassword", "newPassword", "confirmPassword"]) {
    const input = form.elements.namedItem(fieldName);
    if (input instanceof HTMLInputElement) {
      input.value = "";
    }
  }
}
