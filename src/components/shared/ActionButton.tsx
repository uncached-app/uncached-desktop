import type { LucideIcon } from "lucide-react";
import type { MouseEvent } from "react";

/**
 * One verb, reduced to its icon.
 *
 * The label does not disappear, it moves: `aria-label` carries it for anyone not
 * looking at pixels, and the tooltip brings it back on hover. `group-focus-within`
 * is not decoration — without it the row is a line of unlabelled squares to
 * anyone arriving by keyboard.
 *
 * The tooltip hangs below rather than above because these rows sit at the top of
 * a scrolling container, and `overflow-y-auto` would cut off anything drawn
 * above the first thing in it.
 *
 * `align` is which edge it grows from, and it has to follow the row. Anchored
 * left on a row that ends at the right edge, it grows straight into the clip —
 * which is what happened the first time this was reused in the header.
 */
export function ActionButton({
  icon: Icon,
  label,
  detail,
  onClick,
  align = "left",
}: {
  icon: LucideIcon;
  label: string;
  detail?: string;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
  /** Which edge the tooltip grows from — the one the row is not ending at. */
  align?: "left" | "right";
}) {
  return (
    <span className="group/action relative inline-flex">
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        className="group grid size-9 shrink-0 cursor-pointer place-items-center rounded-xl border border-forest-800 bg-forest-900 text-mist-300 shadow-xs transition-all hover:border-sage-400/60 hover:bg-forest-850 hover:text-mist-100 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sage-400"
      >
        <Icon
          size={15}
          className="shrink-0 text-mist-500 transition-colors group-hover:text-sage-300"
          aria-hidden="true"
        />
      </button>

      {/* Anchored to one of the button's edges rather than centred on it. These
          rows sit inside containers that clip both axes — a tooltip centred on
          the first button hangs half of itself outside and gets cut in two. */}
      <span
        role="tooltip"
        className={`pointer-events-none absolute top-full z-20 mt-2 scale-95 rounded-md border border-forest-800 bg-forest-950 px-2 py-1 text-[11px] font-medium text-mist-100 opacity-0 shadow-xl transition-all duration-200 group-hover/action:scale-100 group-hover/action:opacity-100 group-focus-within/action:scale-100 group-focus-within/action:opacity-100 ${
          align === "right" ? "end-0 origin-top-right" : "start-0 origin-top-left"
        }`}
      >
        <span className="block whitespace-nowrap">{label}</span>
        {detail && (
          <span className="mt-0.5 block max-w-56 truncate font-mono text-[10px] text-mist-500">
            {detail}
          </span>
        )}
      </span>
    </span>
  );
}
