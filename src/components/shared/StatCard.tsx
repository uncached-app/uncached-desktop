/**
 * One measured figure with its unit, in the shape every screen states one.
 *
 * Shared rather than copied because the workspace header and the reclaim header
 * were each drawing their own — same idea, different padding, different type
 * scale — which is why the two screens stopped looking like one product.
 */
export function StatCard({
  value,
  label,
  accent = false,
  title,
}: {
  value: string;
  label: string;
  /** The figure the screen is about, rather than context around it. */
  accent?: boolean;
  title?: string;
}) {
  return (
    <div
      title={title}
      className={`inline-flex items-baseline gap-1.5 rounded-xl border px-3 py-1.5 ${
        accent
          ? "border-sage-400/40 bg-sage-400/10 text-sage-300"
          : "border-forest-800 bg-forest-900 text-mist-100"
      }`}
    >
      <span className="font-mono text-sm font-semibold tracking-tight">{value}</span>
      <span className={`text-[11px] ${accent ? "text-sage-300/80 font-medium" : "text-mist-500"}`}>
        {label}
      </span>
    </div>
  );
}
