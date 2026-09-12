import { cn } from "@/lib/utils";

/** Name-first identity: the verification stroke is the v in Sentrovia. */
export function SentroviaLogo({ className }: { className?: string }) {
  return (
    <span
      role="img"
      aria-label="Sentrovia"
      translate="no"
      className={cn("inline-flex shrink-0 items-baseline whitespace-nowrap text-[1.75rem] font-bold leading-none tracking-[-0.055em] text-foreground", className)}
      style={{ fontFamily: "Arial, Helvetica, sans-serif" }}
    >
      <span aria-hidden="true">Sentro</span>
      <svg aria-hidden="true" viewBox="0 0 30 30" className="relative top-[0.025em] -ml-[0.025em] -mr-[0.025em] h-[0.76em] w-[0.72em] self-baseline overflow-visible text-sky-400">
        <path fill="currentColor" d="M0 10h8l6 13L23 2h8L18 30h-8Z" />
      </svg>
      <span aria-hidden="true">ia</span>
    </span>
  );
}
