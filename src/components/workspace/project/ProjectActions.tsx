import { Compass } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ActionButton } from "../../shared/ActionButton";
import { useProjectActions, withOneEditor } from "../../../hooks/useProjectActions";
import type { WorkspaceProject } from "../../../types/workspace";
import { describeFailure } from "../../../i18n/errors";

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
  const { t } = useTranslation();
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
              () => onResult(
                  action.leaves ? null : t("workspace.actions.done", { action: action.title.toLowerCase() }),
                ),
              (error) => onResult(describeFailure(error, t("workspace.actions.failed"))),
            )
          }
        />
      ))}

      <ActionButton icon={Compass} label={t("workspace.actions.showInWorkspace")} onClick={onShowInList} />
    </div>
  );
}
