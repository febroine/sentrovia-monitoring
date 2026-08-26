import { cn } from "@/lib/utils";

type SentroviaMarkProps = Omit<React.ComponentProps<"svg">, "children">;

export function SentroviaMark({ className, ...props }: SentroviaMarkProps) {
  return (
    <svg
      aria-hidden="true"
      className={cn("size-7", className)}
      fill="none"
      focusable="false"
      viewBox="0 0 28 28"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path
        d="M21.75 6.5C19.8 4.9 17.3 4 14.3 4C9.75 4 6.6 6.05 6.6 8.95C6.6 11.85 9.35 13.05 14.25 14.05C19.1 15.05 21.65 16.25 21.65 19.2C21.65 22.2 18.45 24 14 24C10.85 24 8.2 23.05 6.25 21.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.35"
      />
      <circle cx="21.75" cy="6.5" fill="currentColor" r="1.65" />
      <circle cx="6.25" cy="21.5" fill="currentColor" r="1.65" />
    </svg>
  );
}
