import { LockKeyhole } from "lucide-react";
import type { ReactNode } from "react";

type ProLockButtonProps = {
  label: string;
  reason: string;
  locked: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
};

/** A Pro action that stays visible and keeps its own icon; the lock lives in the tooltip. */
export function ProLockButton({ label, reason, locked, disabled = false, onClick, children, className = "" }: ProLockButtonProps) {
  const inert = locked || disabled;

  return (
    <span className="group/prolock relative inline-flex">
      {/* aria-disabled, not disabled: a disabled button loses focus and takes the tooltip with it. */}
      <button
        type="button"
        onClick={() => { if (!inert) onClick(); }}
        aria-disabled={inert}
        aria-label={locked ? `${label}. ${reason}` : label}
        className={`${className} ${locked ? "cursor-not-allowed border-pro-200/30 bg-pro-surface text-pro-100" : disabled ? "cursor-not-allowed text-mist-500" : ""}`}
      >
        {children}
      </button>

      {locked && (
        <span
          role="tooltip"
          className="pointer-events-none absolute -top-9 right-0 z-10 flex scale-95 items-center gap-1.5 whitespace-nowrap rounded-md border border-pro-200/30 bg-pro-surface px-2 py-1 text-[11px] font-medium text-pro-100 opacity-0 shadow-xl transition-all duration-200 group-hover/prolock:scale-100 group-hover/prolock:opacity-100 group-focus-within/prolock:scale-100 group-focus-within/prolock:opacity-100"
        >
          <LockKeyhole size={11} aria-hidden="true" />
          {reason}
        </span>
      )}
    </span>
  );
}
