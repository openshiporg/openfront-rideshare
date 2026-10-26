import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type StatusTone = "blue" | "indigo" | "emerald" | "amber" | "orange" | "green" | "zinc" | "red" | "rose" | "teal";

const DOT: Record<StatusTone, string> = {
  blue: "bg-blue-500",
  indigo: "bg-indigo-500",
  emerald: "bg-emerald-500",
  amber: "bg-amber-500",
  orange: "bg-orange-500",
  green: "bg-green-500",
  zinc: "bg-zinc-400 dark:bg-zinc-500",
  red: "bg-red-500",
  rose: "bg-rose-500",
  teal: "bg-teal-500",
};

export function StatusDot({ tone, pulse = false, className }: { tone: StatusTone; pulse?: boolean; className?: string }) {
  return (
    <span className={cn("relative inline-flex size-2 shrink-0 -translate-y-px rounded-[1px]", DOT[tone], className)} aria-hidden="true">
      {pulse ? <span className={cn("absolute inset-0 animate-ping rounded-[1px] opacity-60 motion-reduce:animate-none", DOT[tone])} /> : null}
    </span>
  );
}

/** A heading whose status dot sits on its first line, followed by the status label. */
export function StatusTitle({
  as: Tag = "h3",
  id,
  tone,
  status,
  pulse,
  className,
  children,
}: {
  as?: "h1" | "h2" | "h3" | "h4" | "p" | "span";
  id?: string;
  tone: StatusTone;
  status?: ReactNode;
  pulse?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Tag id={id} className={cn("flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5", className)}>
      <span className="inline-flex min-w-0 items-start gap-2">
        <span className="inline-flex h-[1lh] shrink-0 items-center"><StatusDot tone={tone} pulse={pulse} className="translate-y-0" /></span>
        <span className="min-w-0 [overflow-wrap:anywhere]">{children}</span>
      </span>
      {status ? <span className="text-xs font-medium text-muted-foreground">{status}</span> : null}
    </Tag>
  );
}
