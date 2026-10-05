import { AlertTriangle } from "lucide-react";

// An error shown inside a dialog or form, where the user is looking; a banner on the page behind an
// open dialog cannot be seen.
export function FormAlert({ message }: { message: string | null | undefined }) {
  if (!message) return null;
  return (
    <div role="alert" className="flex items-start gap-2.5 rounded-md bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <p className="min-w-0 [overflow-wrap:anywhere]">{message}</p>
    </div>
  );
}
