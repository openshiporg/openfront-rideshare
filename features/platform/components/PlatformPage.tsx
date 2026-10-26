import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Page heading block shared by every platform screen: title, optional state line and actions. */
export function PlatformHeader({ title, meta, actions }: { title: ReactNode; meta?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0 space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{title}</h1>
        {meta ? <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">{meta}</div> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/** A titled band of a platform page. */
export function PlatformSection({
  id,
  title,
  meta,
  actions,
  className,
  children,
}: {
  id: string;
  title: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className={cn("space-y-3", className)}>
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 items-baseline gap-2">
          <h2 id={id} className="text-base font-semibold tracking-tight">{title}</h2>
          {meta ? <span className="text-sm tabular-nums text-muted-foreground">{meta}</span> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

/** Quiet inline empty state for a section with nothing in it. */
export function PlatformEmpty({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("border-t border-border py-3 text-sm text-muted-foreground", className)}>{children}</p>;
}
