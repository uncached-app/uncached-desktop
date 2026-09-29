import { LockKeyhole } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

type ProLockButtonProps = {
  label: string;
  reason: string;
  locked: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
  /** Shape only — size, radius, layout. Interactive state is owned here. */
  className?: string;
  /** The tooltip anchor. Width has to reach it for a full-width button. */
  containerClassName?: string;
  /**
   * Replaces the tooltip's horizontal anchor, alignment and wrapping — the
   * three a clipping container needs to change. It replaces rather than appends
   * because two utilities of the same kind in one class string are decided by
   * the order Tailwind emits them, not by the order written here.
   */
  tooltipClassName?: string;
};

/** A Pro action that stays visible and keeps its own icon; the lock lives in the tooltip. */
export function ProLockButton({ label, reason, locked, disabled = false, onClick, children, className = "", containerClassName = "", tooltipClassName = "" }: ProLockButtonProps) {
  const { t } = useTranslation();
  const inert = locked || disabled;
  // Locked looks and responds like enabled: the tooltip carries the plan, not the styling.
  const state = disabled
    ? "cursor-not-allowed border-transparent bg-forest-800 text-mist-500"
    : "border-transparent bg-forest-800 text-mist-300 hover:bg-forest-850 hover:text-sage-300";

  return (
    <span className={`group/prolock relative inline-flex ${containerClassName}`}>
      {/* aria-disabled, not disabled: a disabled button loses focus and takes the tooltip with it. */}
      <button
        type="button"
        onClick={() => { if (!inert) onClick(); }}
        aria-disabled={inert}
        aria-label={locked ? t("shell.proLock.label", { label, reason }) : label}
        className={`grid shrink-0 place-items-center border transition-colors ${className} ${state}`}
      >
        {children}
      </button>

      {locked && (
        <span
          role="tooltip"
          /* Anchored to the button's top edge rather than offset a fixed 36px:
             a tooltip that wraps to two lines grew upward and left a gap. */
          className={`pointer-events-none absolute bottom-full z-10 mb-2 flex scale-95 gap-1.5 rounded-md border border-pro-200/30 bg-pro-surface px-2 py-1 text-[11px] font-medium text-pro-100 opacity-0 shadow-xl transition-all duration-200 group-hover/prolock:scale-100 group-hover/prolock:opacity-100 ${tooltipClassName || "end-0 items-center whitespace-nowrap"}`}
        >
          <LockKeyhole size={11} aria-hidden="true" />
          {reason}
        </span>
      )}
    </span>
  );
}
