import Image from "next/image";
import { cn } from "@/lib/utils";

type SentroviaMarkProps = Omit<React.ComponentProps<typeof Image>, "alt" | "height" | "src" | "width">;

export function SentroviaMark({ className, ...props }: SentroviaMarkProps) {
  return (
    <Image
      alt=""
      aria-hidden="true"
      className={cn("size-7", className)}
      height={64}
      src="/sentrovia-mark-v2.png"
      unoptimized
      width={64}
      {...props}
    />
  );
}
