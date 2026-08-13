import { FolderOpen, Plus, X } from "lucide-react";
import { ProLockButton } from "./ProLockButton";

type RootPickerProps = {
  roots: string[];
  draft: string;
  onDraftChange: (value: string) => void;
  /** Opens the folder picker and folds the result in with the draft. */
  onPick: () => void;
  /** Commits whatever is typed in the field. */
  onCommitDraft: () => void;
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
  draft,
  onDraftChange,
  onPick,
  onCommitDraft,
  onRemove,
  proEnabled,
  containerClassName = "rounded-2xl p-2",
  buttonClassName = "size-10 rounded-xl",
}: RootPickerProps) {
  const chosen = roots.length > 0;

  return (
    <div className={`group flex flex-wrap items-center gap-2 border border-forest-800 bg-forest-900 transition-colors focus-within:border-sage-400 focus-within:ring-2 focus-within:ring-sage-400/20 ${containerClassName}`}>
      <FolderOpen size={18} className="ml-2 shrink-0 text-mist-500 transition-colors group-focus-within:text-sage-400" strokeWidth={1.8} aria-hidden="true" />

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

      <input
        value={draft}
        onChange={(event) => onDraftChange(event.currentTarget.value)}
        onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); onCommitDraft(); } }}
        placeholder={chosen ? "Paste another path..." : "Select or paste folder path..."}
        aria-label="Workspace folder path"
        className="min-w-32 flex-1 bg-transparent px-1 py-2 font-mono text-sm text-mist-100 outline-none placeholder:font-sans placeholder:text-mist-500/50"
        spellCheck={false}
      />

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
