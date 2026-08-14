import type { ReactNode } from "react";

/** A titled card. Every section of the project page is one of these. */
export function Panel({
  title,
  action,
  children,
  className = "",
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-2xl border border-forest-800 bg-forest-900 p-5 shadow-xs ${className}`}>
      <div className="mb-3.5 flex items-center justify-between gap-3">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-mist-500">
          {title}
        </p>
        {action}
      </div>
      {children}
    </div>
  );
}

/** A number and what it counts, for the header. */
export function Figure({ value, label, accent = false }: { value: string; label: string; accent?: boolean }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className={`font-mono text-lg font-bold tracking-tight ${accent ? "text-sage-300" : "text-mist-100"}`}>
        {value}
      </span>
      <span className="font-mono text-[10px] text-mist-500">{label}</span>
    </span>
  );
}

/**
 * One label and one value, where the value is allowed to be far too long.
 *
 * `overflow-hidden` on the row and `min-w-0` on the value are what actually
 * stop a path from running out of the card: a flex item's default minimum
 * width is its content, so without it the row simply grows and the truncation
 * never happens. Values that truncate must also be block-level — `truncate` on
 * an inline element does nothing at all, which is what shipped first.
 */
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline gap-3 overflow-hidden py-1">
      <dt className="w-24 shrink-0 font-medium text-mist-500">{label}</dt>
      <dd className="min-w-0 flex-1 overflow-hidden">{children}</dd>
    </div>
  );
}
