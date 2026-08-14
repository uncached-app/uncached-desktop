import { Folder, Layers, Plus, X } from "lucide-react";
import { rootName } from "./naming";
import { ProLockButton } from "../../shared/ProLockButton";
import { VERDICT_PRESENTATION } from "../verdictPresentation";
import type { Verdict, WorkspaceIndex } from "../../../types/workspace";

/**
 * The folders are the workspace, so they get a column of their own: this is
 * where they are chosen, dropped, and used to narrow the list. The verdict
 * filter lives here too, because both answer the same question — which subset
 * of the list am I reading.
 */
export function WorkspaceSidebar({
  index,
  chosenRoots,
  countByRoot,
  activeRoot,
  onActiveRoot,
  verdictCounts,
  scopedCount,
  activeVerdict,
  onActiveVerdict,
  proEnabled,
  onAddRoot,
  onRemoveRoot,
  onRemoveAllRoots,
}: {
  index: WorkspaceIndex;
  chosenRoots: string[];
  countByRoot: Map<string, number>;
  activeRoot: string | null;
  onActiveRoot: (root: string | null) => void;
  verdictCounts: ReadonlyArray<readonly [Verdict, number]>;
  scopedCount: number;
  activeVerdict: Verdict | null;
  onActiveVerdict: (verdict: Verdict | null) => void;
  proEnabled: boolean;
  onAddRoot: () => void;
  onRemoveRoot: (root: string) => void;
  onRemoveAllRoots: () => void;
}) {
  const singleRoot = chosenRoots.length === 1;

  return (
    <aside className="flex w-48 shrink-0 flex-col overflow-y-auto pr-1 sm:w-56" aria-label="Workspace filters">
      <div className="shrink-0 pb-2">
        <p className="px-2 pb-2 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-mist-500">
          Folders
        </p>

        {/* The list takes the height it needs and no more, so a workspace with one
            folder does not leave a column of empty space above the button. */}
        <div className="grid gap-1">
          {/* With a single folder there is nothing to switch between: the folder
              is the workspace, so "All projects" would name the same set twice. */}
          {!singleRoot && (
            <RootItem
              active={activeRoot === null}
              label="All projects"
              count={index.projects.length}
              icon={Layers}
              onSelect={() => onActiveRoot(null)}
              onRemove={onRemoveAllRoots}
              removeLabel={`Remove all ${chosenRoots.length} workspace folders and start over`}
            />
          )}
          {chosenRoots.map((root) => (
            <RootItem
              key={root}
              active={singleRoot || activeRoot === root}
              label={rootName(root)}
              title={root}
              icon={Folder}
              count={countByRoot.get(root) ?? 0}
              indexed={index.roots.includes(root)}
              onSelect={() => onActiveRoot(singleRoot ? null : root)}
              onRemove={() => {
                if (activeRoot === root) onActiveRoot(null);
                onRemoveRoot(root);
              }}
            />
          ))}
        </div>
      </div>

      <div className="shrink-0 pt-2">
        <ProLockButton
          label="Add another folder"
          reason="Scanning several folders at once is part of Pro"
          locked={!proEnabled && chosenRoots.length > 0}
          onClick={onAddRoot}
          containerClassName="w-full"
          className="w-full rounded-xl border border-forest-800/80 bg-forest-900 px-3 py-2 text-xs font-medium text-mist-300 hover:border-sage-400/60 hover:bg-forest-850 hover:text-mist-100"
          /* The sidebar scrolls, and a scrolling box clips both axes — a tooltip
             wider than the column would be cut off at its edge. So it takes the
             column's width and wraps instead of overflowing it. */
          tooltipClassName="inset-x-0 items-start whitespace-normal text-left leading-snug"
        >
          <span className="inline-flex items-center gap-2">
            <Plus size={14} strokeWidth={2.5} aria-hidden="true" />
            Add folder
          </span>
        </ProLockButton>
        {index.rootsOverLimit.length > 0 && (
          <p className="mt-2 rounded-lg border border-pro-200/30 bg-pro-surface px-2.5 py-1.5 text-[10px] leading-4 text-pro-100">
            This plan covers {index.rootLimit === 1 ? "one folder" : `${index.rootLimit} folders`} at a time.
          </p>
        )}
        {/* Said rather than left out: a folder the system refused is not a
            folder without projects, and the difference is the user's to act on. */}
        {index.unreadable > 0 && (
          <p
            className="mt-2 rounded-lg border border-forest-800 bg-forest-950 px-2.5 py-1.5 text-[10px] leading-4 text-mist-500"
            title={index.unreadableSample.join("\n")}
          >
            {index.unreadable === 1 ? "1 folder was" : `${index.unreadable} folders were`} skipped:
            the system did not grant access. Anything inside is missing from this map.
          </p>
        )}
      </div>

      {/* The list is already grouped by verdict; this narrows it to one, so
          "what is at risk" and "what is safe" can be read on their own. */}
      {verdictCounts.length > 1 && (
        <div className="shrink-0 pt-5">
          <p className="px-2 pb-2 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-mist-500">
            Verdict
          </p>
          <div className="grid gap-1">
            <VerdictFilter
              active={activeVerdict === null}
              label="Every verdict"
              count={scopedCount}
              onSelect={() => onActiveVerdict(null)}
            />
            {verdictCounts.map(([verdict, count]) => (
              <VerdictFilter
                key={verdict}
                active={activeVerdict === verdict}
                label={VERDICT_PRESENTATION[verdict].label}
                title={VERDICT_PRESENTATION[verdict].summary}
                dotClassName={VERDICT_PRESENTATION[verdict].dotClassName}
                count={count}
                onSelect={() => onActiveVerdict(activeVerdict === verdict ? null : verdict)}
              />
            ))}
          </div>
        </div>
      )}

      <div className="flex-1" aria-hidden="true" />
    </aside>
  );
}

/**
 * Selecting narrows the list; the cross drops the folder from the workspace.
 * Remove is not a delete: it stops the folder being read, nothing on disk moves.
 */
function RootItem({
  active,
  label,
  title,
  count,
  icon: Icon = Folder,
  indexed = true,
  onSelect,
  onRemove,
  removeLabel,
}: {
  active: boolean;
  label: string;
  title?: string;
  count: number;
  icon?: typeof Folder;
  indexed?: boolean;
  onSelect: () => void;
  onRemove?: () => void;
  removeLabel?: string;
}) {
  return (
    <div
      className={`group/root flex items-center gap-1 rounded-xl pr-1 transition-all ${
        active
          ? "bg-forest-800 text-mist-100 font-semibold shadow-xs"
          : "text-mist-500 hover:bg-forest-850 hover:text-mist-100"
      }`}
    >
      <button
        type="button"
        onClick={onSelect}
        title={title}
        aria-current={active ? "true" : undefined}
        className="flex min-w-0 flex-1 items-center gap-2 px-2.5 py-2 text-left text-xs transition-colors"
      >
        <Icon size={14} className={`shrink-0 ${active ? "text-sage-300" : "text-mist-500"}`} aria-hidden="true" />
        <span className={`min-w-0 flex-1 truncate ${active ? "font-semibold text-mist-100" : "text-mist-500 group-hover/root:text-mist-100"}`}>
          {label}
        </span>
        <span
          className={`shrink-0 rounded-md px-1.5 py-0.5 font-mono text-[10px] ${
            active ? "bg-forest-900 text-mist-100 font-bold" : "bg-forest-850 text-mist-500"
          }`}
        >
          {indexed ? count : "—"}
        </span>
      </button>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={removeLabel ?? `Remove ${label} from the workspace`}
          className="grid size-6 shrink-0 place-items-center rounded-lg text-mist-500 opacity-0 transition-all group-hover/root:opacity-100 group-focus-within/root:opacity-100 hover:bg-forest-900 hover:text-coral-300"
        >
          <X size={12} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

function VerdictFilter({
  active,
  label,
  title,
  count,
  dotClassName,
  onSelect,
}: {
  active: boolean;
  label: string;
  title?: string;
  count: number;
  dotClassName?: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      title={title}
      aria-pressed={active}
      className={`group flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-xs transition-all ${
        active
          ? "bg-forest-800 font-semibold text-mist-100 shadow-xs"
          : "text-mist-500 hover:bg-forest-850 hover:text-mist-100"
      }`}
    >
      <span className={`size-2 shrink-0 rounded-full ${dotClassName ?? "bg-transparent"}`} aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span
        className={`shrink-0 rounded-md px-1.5 py-0.5 font-mono text-[10px] ${
          active ? "bg-forest-900 text-mist-100 font-bold" : "bg-forest-850 text-mist-500"
        }`}
      >
        {count}
      </span>
    </button>
  );
}
