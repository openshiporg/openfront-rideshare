import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import "./fleet.css";
import { cn } from "@/lib/utils";

// Platform tabs and segmented choices: flat underline tabs; the current one carries the
// cab-yellow rule. The row scrolls sideways on narrow screens instead of wrapping.
export function PillTrack({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <div className={cn("max-w-full overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", className)}>
      <div role="group" aria-label={label} className="flex min-w-max items-end gap-5 border-b border-border">
        {children}
      </div>
    </div>
  );
}

const pillClass = (active: boolean, size: "sm" | "md") =>
  cn(
    "-mb-px inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap border-b-2 text-sm transition-colors outline-none focus-visible:text-foreground focus-visible:underline disabled:pointer-events-none disabled:opacity-50",
    size === "md" ? "min-h-11" : "min-h-10",
    active
      ? "border-[var(--rf-rule)] font-medium text-foreground"
      : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
  );

function PillCount({ count, active }: { count?: number; active: boolean }) {
  if (typeof count !== "number") return null;
  return <span className={cn("rf-figures text-xs", active ? "text-muted-foreground" : "text-muted-foreground/70")}>{count}</span>;
}

/** URL-driven pill: stays a link and marks the current view. */
export function PillLink({ href, active, count, size = "sm", children }: { href: string; active: boolean; count?: number; size?: "sm" | "md"; children: ReactNode }) {
  return (
    <Link href={href} aria-current={active ? "page" : undefined} className={pillClass(active, size)} scroll={false}>
      {children}
      <PillCount count={count} active={active} />
    </Link>
  );
}

/** Local-state pill for in-page tabs and segmented choices. */
export function PillButton({ active, count, size = "sm", className, children, ...props }: Omit<ComponentProps<"button">, "type"> & { active: boolean; count?: number; size?: "sm" | "md" }) {
  return (
    <button type="button" aria-pressed={active} className={cn(pillClass(active, size), className)} {...props}>
      {children}
      <PillCount count={count} active={active} />
    </button>
  );
}

/** In-page command group: a row of square buttons. Wraps on narrow screens. */
export function ActionTrack({ label, className, children }: { label?: string; className?: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className={cn("inline-flex max-w-full flex-wrap items-center gap-1.5", className)}>
      {children}
    </div>
  );
}

const trackTone = {
  primary: "border-[var(--rf-rule)] bg-[var(--rf-yellow)] font-semibold text-[var(--rf-on-yellow)] hover:bg-[var(--rf-yellow-hover)]",
  default: "border-input bg-background text-foreground hover:bg-muted",
  quiet: "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
  danger: "border-destructive/40 bg-background text-destructive hover:bg-destructive/5",
} as const;

/** A square-cornered button inside an ActionTrack. */
export function TrackButton({ tone = "default", size = "sm", className, children, ...props }: Omit<ComponentProps<"button">, "type"> & { tone?: keyof typeof trackTone; size?: "sm" | "md" | "lg"; type?: "button" | "submit" }) {
  return (
    <button
      type={props.type ?? "button"}
      className={cn(
        "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-[4px] border px-3 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
        size === "lg" ? "min-h-12 px-5 text-base" : size === "md" ? "min-h-10 px-4" : "min-h-8",
        trackTone[tone],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
