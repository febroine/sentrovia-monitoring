import type { ElementType, ReactNode } from "react";

import { cn } from "@/lib/utils";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ElementType;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 py-8 text-center", className)}>
      <div className="max-w-md space-y-1">
        <div className="flex items-center justify-center gap-2">
          {Icon ? <Icon className="size-4 text-muted-foreground" /> : null}
          <p className="text-sm font-medium text-foreground">{title}</p>
        </div>
        {description ? <p className="text-xs leading-5 text-muted-foreground">{description}</p> : null}
      </div>
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  );
}
