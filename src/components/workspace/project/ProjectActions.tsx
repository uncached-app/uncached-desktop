import { Compass, type LucideIcon } from "lucide-react";
import { useProjectActions } from "../../../hooks/useProjectActions";
import type { WorkspaceProject } from "../../../types/workspace";

/**
 * One verb, reduced to its icon.
 *
 * The label does not disappear, it moves: `aria-label` carries it for anyone not
 * looking at pixels, and the tooltip brings it back on hover. `group-focus-within`
 * is not decoration — without it the row is a line of unlabelled squares to
 * anyone arriving by keyboard.
 *
 * The tooltip hangs below rather than above because this row sits at the top of a
 * scrolling container, and `overflow-y-auto` would cut off anything drawn above
 * the first thing in it.
 */
function ActionButton({
  icon: Icon,
  label,
  detail,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  detail?: string;
  onClick: () => void;
}) {
  return (
    <span className="group/action relative inline-flex">
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        className="group grid size-9 shrink-0 place-items-center rounded-xl border border-forest-800 bg-forest-900 text-mist-300 shadow-xs transition-all hover:border-sage-400/60 hover:bg-forest-850 hover:text-mist-100 active:scale-[0.97]"
      >
        <Icon
          size={15}
          className="shrink-0 text-mist-500 transition-colors group-hover:text-sage-300"
          aria-hidden="true"
        />
      </button>

      {/* Anchored to the button's left edge rather than centred on it. The row
          sits inside a scroller, and `overflow-y-auto` clips both axes — a
          tooltip centred on the first button hangs half of itself outside the
          container and gets cut in two. */}
      <span
        role="tooltip"
        className="pointer-events-none absolute top-full left-0 z-20 mt-2 scale-95 origin-top-left rounded-md border border-forest-800 bg-forest-950 px-2 py-1 text-[11px] font-medium text-mist-100 opacity-0 shadow-xl transition-all duration-200 group-hover/action:scale-100 group-hover/action:opacity-100"
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

/**
 * The verbs, as buttons.
 *
 * The list comes from the same hook the palette reads, so the two can never
 * offer different things. What belongs to this screen is only the one action
 * that stays inside the app.
 */
export function ProjectActions({
  project,
  onShowInList,
  onResult,
}: {
  project: WorkspaceProject;
  onShowInList: () => void;
  /** Told what happened, since most of these finish somewhere else entirely. */
  onResult: (message: string | null) => void;
}) {
  const actions = useProjectActions(project);

  // One button per verb, not one per installed editor. `useProjectActions`
  // returns every editor because the palette lists them all and lets you pick;
  // a row of identical pencil icons is a row nobody can read, so this takes the
  // best one for this project and leaves the rest to the palette.
  const shown = actions.filter(
    (action, position) =>
      !action.id.startsWith("open-") ||
      action.id === "open-terminal" ||
      actions.findIndex((first) => first.id.startsWith("open-") && first.id !== "open-terminal") ===
        position,
  );

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {shown.map((action) => (
        <ActionButton
          key={action.id}
          icon={action.icon}
          label={action.title}
          detail={action.detail}
          onClick={() =>
            void action.perform().then(
              () => onResult(action.leaves ? null : `${action.title.toLowerCase()} — done`),
              (error) => onResult(typeof error === "string" ? error : "That did not work"),
            )
          }
        />
      ))}

      <ActionButton icon={Compass} label="Show in workspace map" onClick={onShowInList} />
    </div>
  );
}
