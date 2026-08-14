import { Compass } from "lucide-react";
import { useProjectActions } from "../../../hooks/useProjectActions";
import type { WorkspaceProject } from "../../../types/workspace";

const BUTTON =
  "flex items-center gap-2 rounded-xl border border-forest-800 bg-forest-900 px-3 py-2 text-xs text-mist-300 transition-colors hover:border-sage-400 hover:text-mist-100";

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

  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((action) => {
        const Icon = action.icon;
        return (
          <button
            key={action.id}
            type="button"
            onClick={() =>
              void action.perform().then(
                () => onResult(action.leaves ? null : `${action.title.toLowerCase()} — done`),
                (error) => onResult(typeof error === "string" ? error : "That did not work"),
              )
            }
            className={BUTTON}
          >
            <Icon size={13} aria-hidden="true" />
            {action.title}
          </button>
        );
      })}

      <button type="button" onClick={onShowInList} className={BUTTON}>
        <Compass size={13} aria-hidden="true" />
        Show in workspace
      </button>
    </div>
  );
}
