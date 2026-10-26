import { cn } from "@/lib/utils";

/** A vehicle registration set like a plate: black lettering on plate white, ruled edge. */
export function Plate({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn("rf-figures inline-flex h-5 items-center rounded-[3px] border border-[var(--rf-plate-line)] bg-[var(--rf-plate)] px-1.5 font-mono text-[11px] font-semibold uppercase tracking-wide text-foreground", className)}>{children}</span>;
}
