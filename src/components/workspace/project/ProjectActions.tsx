import { Compass } from "lucide-react";
import { ActionButton } from "../../shared/ActionButton";
import { useProjectActions, withOneEditor } from "../../../hooks/useProjectActions";
import type { WorkspaceProject } from "../../../types/workspace";

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

  const shown = withOneEditor(actions);

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

      <ActionButton icon={Compass} label="Show in workspace" onClick={onShowInList} />
    </div>
  );
}
