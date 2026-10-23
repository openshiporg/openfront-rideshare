import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

// Platform segmented controls: a raised pill in a recessed track. The track scrolls
// sideways on narrow screens instead of wrapping.
export function PillTrack({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <div className={cn("max-w-full overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", className)}>
      <div role="group" aria-label={label} className="inline-flex min-w-max items-center gap-0.5 rounded-full bg-muted p-1 ring-1 ring-inset ring-foreground/5">
        {children}
      </div>
    </div>
  );
}

const pillClass = (active: boolean, size: "sm" | "md") =>
  cn(
    "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-3 text-sm transition-[color,background-color,box-shadow] outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
    size === "md" ? "min-h-10 px-4" : "min-h-8",
    active
      ? "bg-background font-medium text-foreground shadow-sm ring-1 ring-foreground/10"
      : "text-muted-foreground hover:text-foreground",
  );

function PillCount({ count, active }: { count?: number; active: boolean }) {
  if (typeof count !== "number") return null;
  return <span className={cn("tabular-nums text-xs", active ? "text-muted-foreground" : "text-muted-foreground/70")}>{count}</span>;
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

/** In-page command group: raised pill buttons in one recessed track. Wraps on narrow screens. */
export function ActionTrack({ label, className, children }: { label?: string; className?: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className={cn("inline-flex max-w-full flex-wrap items-center gap-1 rounded-[1.375rem] bg-muted p-1 ring-1 ring-inset ring-foreground/5", className)}>
      {children}
    </div>
  );
}

const trackTone = {
  primary: "bg-foreground text-background shadow-sm hover:opacity-90",
  default: "bg-background text-foreground shadow-sm ring-1 ring-foreground/10 hover:bg-background/80",
  quiet: "text-muted-foreground hover:text-foreground",
  danger: "bg-background text-destructive shadow-sm ring-1 ring-destructive/25 hover:bg-destructive/10",
} as const;

/** A raised pill inside an ActionTrack. */
export function TrackButton({ tone = "default", size = "sm", className, children, ...props }: Omit<ComponentProps<"button">, "type"> & { tone?: keyof typeof trackTone; size?: "sm" | "md" | "lg"; type?: "button" | "submit" }) {
  return (
    <button
      type={props.type ?? "button"}
      className={cn(
        "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-sm font-medium transition-[opacity,background-color,color] outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
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
