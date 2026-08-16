import { PanelRight } from "lucide-react";
import { MenuRow } from "../../shared/MenuRow";
import { ContextMenu } from "../../shared/ContextMenu";
import { useProjectActions, withOneEditor } from "../../../hooks/useProjectActions";
import type { WorkspaceProject } from "../../../types/workspace";

/** Where the pointer was, in viewport coordinates. */
export type MenuAnchor = { project: WorkspaceProject; x: number; y: number };

/**
 * The project's verbs, at the pointer.
 *
 * Reads `useProjectActions`, which is also what the palette and the project
 * page read, so the three can never offer different things — the reason that
 * hook exists at all.
 *
 * Every entry leaves the app or copies something. Nothing here reclaims: a
 * destructive action one right-click and one small target away from a row is
 * how a workspace loses a project nobody meant to touch. Opening the page,
 * which is where reclaiming lives, is the first entry instead.
 *
 * Verbs only — no headings, no descriptions, no right-hand column. Each of
 * those was carrying something the reader already had: which project (they
 * right-clicked it), what the project page holds, and the absolute path.
 */
export function ProjectContextMenu({
  anchor,
  onOpenProject,
  onResult,
  onClose,
}: {
  anchor: MenuAnchor;
  onOpenProject: (path: string) => void;
  onResult: (message: string | null) => void;
  onClose: () => void;
}) {
  // One editor, and no more. Choosing between them is what the palette is
  // for; here it would be a run of identical pencils.
  const actions = withOneEditor(useProjectActions(anchor.project));

  return (
    <ContextMenu at={anchor} label={`${anchor.project.name} actions`} onClose={onClose}>
      <MenuRow
        icon={PanelRight}
        title="Open project page"
        onSelect={() => {
          onOpenProject(anchor.project.path);
          onClose();
        }}
      />

      {actions.map((action) => (
        <MenuRow
          key={action.id}
          icon={action.icon}
          title={action.title}
          onSelect={() => {
            onClose();
            void action.perform().then(
              () => onResult(action.leaves ? null : `${action.title.toLowerCase()} — done`),
              (error) => onResult(typeof error === "string" ? error : "That did not work"),
            );
          }}
        />
      ))}
    </ContextMenu>
  );
}
