import { useTranslation } from "react-i18next";
import { MenuRow } from "./MenuRow";
import { ContextMenu } from "./ContextMenu";
import { useFolderActions } from "../../hooks/useFolderActions";
import { withOneEditor } from "../../hooks/useProjectActions";
import { describeFailure } from "../../i18n/errors";

/** The folder the menu is about, and where the pointer was. */
export type FolderAnchor = { path: string; name: string; x: number; y: number };

/**
 * A folder's verbs, at the pointer.
 *
 * Offered on a workspace root and on a folder holding several projects — the
 * two things that were on screen with nothing to do to them. One editor, as in
 * the project menu: a run of identical pencils is a run nobody reads.
 */
export function FolderMenu({
  anchor,
  onResult,
  onClose,
}: {
  anchor: FolderAnchor;
  onResult: (message: string | null) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const actions = withOneEditor(useFolderActions(anchor.path));

  return (
    <ContextMenu at={anchor} label={t("shell.folderMenu.label", { name: anchor.name })} onClose={onClose}>
      {actions.map((action) => (
        <MenuRow
          key={action.id}
          icon={action.icon}
          title={action.title}
          onSelect={() => {
            onClose();
            void action.perform().then(
              () => onResult(action.leaves ? null : t("shell.actions.done", { action: action.title.toLowerCase() })),
              (error) => onResult(describeFailure(error, t("shell.actions.failed"))),
            );
          }}
        />
      ))}
    </ContextMenu>
  );
}
