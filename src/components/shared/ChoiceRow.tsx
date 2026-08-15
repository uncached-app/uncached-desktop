/**
 * One choice out of a few, as a row of bare buttons.
 *
 * Bare on the page rather than inside a bordered box: these always sit in a
 * header or a card that already has a border, and a control strip with its own
 * frame is a card inside a card.
 *
 * Shared because the app was drawing this four times — the two order toggles,
 * the idle and size thresholds on the maintenance policy, and the schedule's
 * interval — each with slightly different padding and a slightly different
 * active state, which is how three screens stop looking like one product.
 */
export function ChoiceRow<T extends string | number>({
  options,
  active,
  onChange,
  disabled = false,
}: {
  /** `[value, label, what choosing it means]`. */
  options: ReadonlyArray<readonly [T, string, string?]>;
  active: T;
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1 font-mono text-[11px]">
      {options.map(([value, label, why]) => (
        <button
          key={value}
          type="button"
          disabled={disabled}
          onClick={() => onChange(value)}
          aria-pressed={active === value}
          title={why}
          className={`cursor-pointer rounded-lg px-2.5 py-1.5 font-medium transition-all active:scale-[0.98] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sage-400 disabled:cursor-not-allowed disabled:opacity-40 ${
            active === value
              ? "bg-sage-400 font-semibold text-forest-950 shadow-xs"
              : "border border-forest-800 bg-forest-950/60 text-mist-400 hover:border-forest-750 hover:bg-forest-850 hover:text-mist-100"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
