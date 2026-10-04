import { type ReactNode } from "react";

export function SettingsGroup({ children }: { children: ReactNode }) {
  return <div className="divide-y divide-forest-800 border-y border-forest-800">{children}</div>;
}

/**
 * Clean iOS/macOS styled toggle switch matching the modal alignment.
 */
export function SettingToggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-4 text-xs text-mist-100">
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-medium text-mist-100">{label}</span>
        {hint && <span className="text-xs leading-5 text-mist-500">{hint}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage-400 ${checked ? "bg-sage-400" : "bg-forest-800"
          }`}
      >
        <span
          aria-hidden="true"
          className={`pointer-events-none inline-block size-4 transform rounded-full bg-forest-950 shadow-xs transition duration-200 ease-in-out ${checked ? "translate-x-4 bg-forest-950" : "translate-x-0 bg-mist-300"
            }`}
        />
      </button>
    </div>
  );
}

export function SettingRadio({
  icon,
  label,
  hint,
  selected,
  disabled = false,
  unavailable,
  onClick,
}: {
  icon?: ReactNode;
  label: string;
  hint?: string;
  selected: boolean;
  disabled?: boolean;
  /** Why this one cannot be chosen, for the row that cannot say it itself. */
  unavailable?: string;
  onClick: () => void;
}) {
  // `:hover` still matches a disabled button — the pointer is over it, and CSS
  // has no opinion about whether pressing would do anything. So a row that
  // could not be chosen still lit up on the way past, three times over: the
  // label, the icon and the dot each carried their own hover rule. Built here
  // rather than with a variant, so the condition is visible beside the styles
  // it gates.
  const live = !disabled;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={disabled ? unavailable : undefined}
      className={`group flex w-full items-center justify-between gap-4 py-4 text-start text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${
        disabled ? "" : "cursor-pointer"
      } ${selected ? "text-mist-100" : `text-mist-500 ${live ? "hover:text-mist-300" : ""}`}`}
    >
      <span className="flex min-w-0 flex-1 items-start gap-3">
        {icon && (
          <span
            className={`mt-0.5 shrink-0 text-mist-500 transition-colors ${live ? "group-hover:text-mist-300" : ""}`}
          >
            {icon}
          </span>
        )}
        <span className="flex flex-col gap-0.5">
          <span className={`font-medium ${selected ? "text-mist-100" : "text-mist-300"}`}>{label}</span>
          {hint && <span className="text-xs leading-5 text-mist-500">{hint}</span>}
        </span>
      </span>
      <span
        className={`grid size-4.5 shrink-0 place-items-center rounded-full border transition-colors ${selected
            ? "border-sage-400 bg-sage-400 text-forest-950"
            : `border-forest-750 bg-forest-950/60 ${live ? "group-hover:border-forest-700" : ""}`
          }`}
      >
        {selected && <span className="size-1.5 rounded-full bg-forest-950" />}
      </span>
    </button>
  );
}
