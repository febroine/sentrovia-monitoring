import { cn } from "@/lib/utils";

export function SentroviaMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex items-center justify-center font-semibold leading-none tracking-normal",
        className
      )}
    >
      S
    </span>
  );
}
