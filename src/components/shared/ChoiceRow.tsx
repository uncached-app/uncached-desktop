/**
 * Interactive segmented choice row with smooth, natural hover states.
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
    <div className="inline-flex flex-wrap items-center gap-1.5 font-mono text-[11px]">
      {options.map(([value, label, why]) => {
        const isSelected = active === value;
        return (
          <button
            key={value}
            type="button"
            disabled={disabled}
            onClick={() => onChange(value)}
            aria-pressed={isSelected}
            title={why}
            className={`cursor-pointer rounded-xl px-3 py-1.5 font-medium transition-colors duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sage-400 disabled:cursor-not-allowed disabled:opacity-40 ${
              isSelected
                ? "bg-sage-400 font-bold text-forest-950 shadow-xs hover:bg-sage-300"
                : "border border-forest-800 bg-forest-900 text-mist-300 hover:border-forest-700 hover:bg-forest-800 hover:text-mist-100"
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
