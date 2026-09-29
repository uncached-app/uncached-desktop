import { FolderOpen, Plus, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ProLockButton } from "./ProLockButton";
import { FolderMenu, type FolderAnchor } from "./FolderMenu";
import { folderName } from "../../utils/folderName";
import { useFlash } from "../../hooks/useFlash";

type RootPickerProps = {
  roots: string[];
  onPick: () => void;
  onRemove: (root: string) => void;
  proEnabled: boolean;
  containerClassName?: string;
  buttonClassName?: string;
};

export function RootPicker({
  roots,
  onPick,
  onRemove,
  proEnabled,
  containerClassName = "rounded-2xl p-2",
  buttonClassName = "size-10 rounded-xl",
}: RootPickerProps) {
  const { t } = useTranslation();
  const chosen = roots.length > 0;
  // The chosen folders are the one place a root is a thing you can point at,
  // which makes it where reaching the folder itself belongs — the gesture that
  // used to require leaving for Finder.
  const [menu, setMenu] = useState<FolderAnchor | null>(null);
  const [said, setSaid] = useFlash();

  const open = (root: string, event: React.MouseEvent) => {
    event.preventDefault();
    setMenu({ path: root, name: folderName(root), x: event.clientX, y: event.clientY });
  };

  return (
    <>
      <div className={`group flex flex-wrap items-center gap-2 border border-forest-800 bg-forest-900 transition-colors ${containerClassName}`}>
        <FolderOpen size={18} className="ms-2 shrink-0 text-mist-500" strokeWidth={1.8} aria-hidden="true" />

        {roots.map((root) => (
          <span key={root} className="group/pill relative inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-forest-800 py-1.5 ps-1 pe-1.5">
            <button
              type="button"
              onClick={(event) => open(root, event)}
              onContextMenu={(event) => open(root, event)}
              aria-haspopup="menu"
              aria-label={t("shell.actionsFor", { name: folderName(root) })}
              className="max-w-40 cursor-pointer truncate rounded-md px-1.5 py-0.5 text-xs font-medium text-mist-100 transition-colors hover:bg-forest-850 hover:text-sage-300"
            >
              {folderName(root)}
            </button>
            <span role="tooltip" className="pointer-events-none absolute -top-8 start-0 z-10 max-w-xs scale-95 truncate whitespace-nowrap rounded-md border border-forest-800 bg-forest-950 px-2 py-1 font-mono text-[10px] text-mist-300 opacity-0 shadow-xl transition-all duration-200 group-hover/pill:scale-100 group-hover/pill:opacity-100">
              {root}
            </span>
            <button type="button" onClick={() => onRemove(root)} aria-label={t("shell.rootPicker.remove", { name: folderName(root) })} className="grid size-5 shrink-0 place-items-center rounded-md text-mist-500 transition-colors hover:bg-forest-850 hover:text-coral-300">
              <X size={12} aria-hidden="true" />
            </button>
          </span>
        ))}

        {!chosen && <span className="flex-1 px-1 py-2 text-start text-sm text-mist-500/50">{t("shell.rootPicker.empty")}</span>}
        {chosen && <span className="flex-1" />}

        {/* Browse and + open the same picker, so only one of them is ever shown. */}
        {chosen ? (
          <ProLockButton
            label={t("shell.rootPicker.addAnother")}
            reason={t("shell.rootPicker.multiRootPro")}
            locked={!proEnabled}
            onClick={onPick}
            className={buttonClassName}
          >
            <Plus size={16} strokeWidth={1.8} aria-hidden="true" />
          </ProLockButton>
        ) : (
          <button type="button" onClick={onPick} className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-forest-800 px-4 py-2.5 text-sm font-medium text-mist-300 transition-colors hover:bg-forest-850 hover:text-sage-300" aria-label={t("shell.rootPicker.browseLabel")}>
            <FolderOpen size={15} strokeWidth={1.8} aria-hidden="true" />
            <span>{t("shell.rootPicker.browse")}</span>
          </button>
        )}
      </div>

      {/* Copying a path is the one verb whose result is not somewhere else, so
          it needs saying here. Everything else opens another program. */}
      <p className="min-h-4 px-1 pt-1 text-[11px] text-mist-500" aria-live="polite">
        {said}
      </p>

      {menu && (
        <FolderMenu anchor={menu} onResult={setSaid} onClose={() => setMenu(null)} />
      )}
    </>
  );
}
