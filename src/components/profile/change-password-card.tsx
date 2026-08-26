"use client";

import { useRef, useState } from "react";
import { Eye, EyeOff, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

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

    try {
      const response = await submitPasswordChange(event.currentTarget);
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
    <section className="grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-12">
      <SecurityIntro />
      <form ref={formRef} className="border-y py-6" onSubmit={handleSubmit}>
        <div className="grid gap-5">
          <PasswordField
            name="currentPassword"
            label="Current password"
            placeholder="Enter your current password"
            minLength={1}
            visible={showValues.currentPassword}
            onToggle={() => toggleField("currentPassword", setShowValues)}
          />
          <div className="grid gap-4 sm:grid-cols-2">
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
        </div>

        <PasswordRequirements />
        {error ? <Banner tone="error">{error}</Banner> : null}
        {message ? <Banner tone="success">{message}</Banner> : null}

        <div className="mt-6 flex justify-end border-t pt-5">
          <Button type="submit" disabled={submitting} className="min-w-36">
            {submitting ? (
              <>
                <LoaderCircle data-icon="inline-start" className="animate-spin" />
                Updating
              </>
            ) : (
              "Update password"
            )}
          </Button>
        </div>
      </form>
    </section>
  );
}

function SecurityIntro() {
  return (
    <div>
      <h2 className="text-sm font-semibold">Password</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        Confirm your current password before choosing a new one. Your signed-in session remains active.
      </p>
    </div>
  );
}

function PasswordRequirements() {
  return (
    <div className="mt-6 border-l-2 border-amber-500/60 pl-4 text-xs leading-5 text-muted-foreground">
      Use at least 12 characters with uppercase, lowercase, a number, and a special character.
    </div>
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
      <Label htmlFor={name} className="text-xs text-muted-foreground">
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
          className="h-10 rounded-md pr-11"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onToggle}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md text-muted-foreground"
          aria-label={visible ? `Hide ${label}` : `Show ${label}`}
        >
          {visible ? <Eye /> : <EyeOff />}
        </Button>
      </div>
    </div>
  );
}

function Banner({ children, tone }: { children: React.ReactNode; tone: "error" | "success" }) {
  return (
    <div
      role="status"
      className={cn(
        "mt-5 border-l-2 px-4 py-3 text-sm",
        tone === "error"
          ? "border-destructive bg-destructive/5 text-destructive"
          : "border-emerald-500 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400"
      )}
    >
      {children}
    </div>
  );
}

async function submitPasswordChange(form: HTMLFormElement) {
  const formData = new FormData(form);
  return fetch("/api/auth/change-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    credentials: "same-origin",
    referrerPolicy: "same-origin",
    body: JSON.stringify({
      currentPassword: String(formData.get("currentPassword") ?? ""),
      newPassword: String(formData.get("newPassword") ?? ""),
      confirmPassword: String(formData.get("confirmPassword") ?? ""),
    }),
  });
}

function toggleField(
  field: PasswordFieldName,
  setState: React.Dispatch<React.SetStateAction<Record<PasswordFieldName, boolean>>>
) {
  setState((current) => ({ ...current, [field]: !current[field] }));
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
