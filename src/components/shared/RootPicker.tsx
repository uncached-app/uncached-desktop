import { FolderOpen, Plus, X } from "lucide-react";
import { ProLockButton } from "./ProLockButton";

type RootPickerProps = {
  roots: string[];
  onPick: () => void;
  onRemove: (root: string) => void;
  proEnabled: boolean;
  containerClassName?: string;
  buttonClassName?: string;
};

/** Folder name, or the path itself when it has no usable last segment. */
function folderName(path: string): string {
  const segments = path.split(/[/\\]/).filter(Boolean);
  return segments[segments.length - 1] ?? path;
}

export function RootPicker({
  roots,
  onPick,
  onRemove,
  proEnabled,
  containerClassName = "rounded-2xl p-2",
  buttonClassName = "size-10 rounded-xl",
}: RootPickerProps) {
  const chosen = roots.length > 0;

  return (
    <div className={`group flex flex-wrap items-center gap-2 border border-forest-800 bg-forest-900 transition-colors ${containerClassName}`}>
      <FolderOpen size={18} className="ml-2 shrink-0 text-mist-500" strokeWidth={1.8} aria-hidden="true" />

      {roots.map((root) => (
        <span key={root} className="group/pill relative inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-forest-800 py-1.5 pl-2.5 pr-1.5">
          <span className="max-w-40 truncate text-xs font-medium text-mist-100">{folderName(root)}</span>
          <span role="tooltip" className="pointer-events-none absolute -top-8 left-0 z-10 max-w-xs scale-95 truncate whitespace-nowrap rounded-md border border-forest-800 bg-forest-950 px-2 py-1 font-mono text-[10px] text-mist-300 opacity-0 shadow-xl transition-all duration-200 group-hover/pill:scale-100 group-hover/pill:opacity-100">
            {root}
          </span>
          <button type="button" onClick={() => onRemove(root)} aria-label={`Remove ${folderName(root)}`} className="grid size-5 shrink-0 place-items-center rounded-md text-mist-500 transition-colors hover:bg-forest-850 hover:text-coral-300">
            <X size={12} aria-hidden="true" />
          </button>
        </span>
      ))}

      {!chosen && <span className="flex-1 px-1 py-2 text-left text-sm text-mist-500/50">No folder selected yet</span>}
      {chosen && <span className="flex-1" />}

      {/* Browse and + open the same picker, so only one of them is ever shown. */}
      {chosen ? (
        <ProLockButton
          label="Add another folder"
          reason="Scanning several folders at once is part of Pro"
          locked={!proEnabled}
          onClick={onPick}
          className={buttonClassName}
        >
          <Plus size={16} strokeWidth={1.8} aria-hidden="true" />
        </ProLockButton>
      ) : (
        <button type="button" onClick={onPick} className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-forest-800 px-4 py-2.5 text-sm font-medium text-mist-300 transition-colors hover:bg-forest-850 hover:text-sage-300" aria-label="Browse for a folder">
          <FolderOpen size={15} strokeWidth={1.8} aria-hidden="true" />
          <span>Browse</span>
        </button>
      )}
    </div>
  );
}
