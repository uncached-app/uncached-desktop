import {
  Folder,
  Layers,
  PanelLeftClose,
  Plus,
  RotateCcw,
  X,
  type LucideIcon,
} from "lucide-react";
import { rootName } from "./naming";
import { ProLockButton } from "../../shared/ProLockButton";
import { VERDICT_PRESENTATION } from "../verdictPresentation";
import { categoryPresentation } from "../../findings/categoryPresentation";
import type { Verdict, WorkspaceIndex } from "../../../types/workspace";

type WorkspaceSidebarProps = {
  index: WorkspaceIndex;
  chosenRoots: string[];
  countByRoot: Map<string, number>;
  activeRoot: string | null;
  onActiveRoot: (root: string | null) => void;
  verdictCounts: ReadonlyArray<readonly [Verdict, number]>;
  scopedCount: number;
  activeVerdict: Verdict | null;
  onActiveVerdict: (verdict: Verdict | null) => void;
  /** Artifact kinds present in scope, most common first. */
  categoryCounts: ReadonlyArray<readonly [string, number]>;
  activeCategory: string | null;
  onActiveCategory: (category: string | null) => void;
  cloneCount: number;
  clonesOnly: boolean;
  onClonesOnly: (only: boolean) => void;
  proEnabled: boolean;
  onAddRoot: () => void;
  onRemoveRoot: (root: string) => void;
  onRemoveAllRoots: () => void;
  onCollapse?: () => void;
};

/**
 * Workspace filter sidebar with clean, non-overflowing layout and collapse button.
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
  categoryCounts,
  activeCategory,
  onActiveCategory,
  cloneCount,
  clonesOnly,
  onClonesOnly,
  proEnabled,
  onAddRoot,
  onRemoveRoot,
  onRemoveAllRoots,
  onCollapse,
}: WorkspaceSidebarProps) {
  const singleRoot = chosenRoots.length === 1;

  const hasActiveFilters =
    activeRoot !== null || activeVerdict !== null || activeCategory !== null || clonesOnly;

  const clearAllFilters = () => {
    onActiveRoot(null);
    onActiveVerdict(null);
    onActiveCategory(null);
    onClonesOnly(false);
  };

  return (
    <aside
      className="flex w-52 shrink-0 flex-col overflow-y-auto overflow-x-hidden pr-2 sm:w-60 select-none"
      aria-label="Workspace filters"
    >
      {/* Quick Active Filter Indicator & Reset */}
      {hasActiveFilters && (
        <div className="mb-2 shrink-0 px-1">
          <button
            type="button"
            onClick={clearAllFilters}
            className="flex w-full items-center justify-between rounded-lg border border-forest-800 bg-forest-900 px-2.5 py-1.5 text-xs text-sage-300 hover:bg-forest-850 transition-colors cursor-pointer"
          >
            <span className="flex items-center gap-1.5 font-medium">
              <RotateCcw size={12} />
              Reset active filters
            </span>
            <span className="font-mono text-[10px] text-mist-500">clear</span>
          </button>
        </div>
      )}

      {/* 1. Folders Section */}
      <div className="shrink-0 pb-2">
        <div className="flex items-center justify-between px-2 pb-2">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-mist-500">
            Folders
          </p>
          {onCollapse && (
            <button
              type="button"
              onClick={onCollapse}
              title="Collapse sidebar"
              aria-label="Collapse sidebar"
              className="grid size-5.5 place-items-center rounded-lg text-mist-500 hover:bg-forest-850 hover:text-mist-100 transition-colors cursor-pointer"
            >
              <PanelLeftClose size={13} />
            </button>
          )}
        </div>

        <div className="grid gap-1 min-w-0">
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

          <div className="pt-1.5">
            <ProLockButton
              label="Add another folder"
              reason="Scanning several folders at once is part of Pro"
              locked={!proEnabled && chosenRoots.length > 0}
              onClick={onAddRoot}
              containerClassName="w-full"
              className="w-full rounded-xl border border-forest-800/80 bg-forest-900 px-3 py-2 text-xs font-medium text-mist-300 hover:border-sage-400/60 hover:bg-forest-850 hover:text-mist-100 cursor-pointer"
              tooltipClassName="inset-x-0 items-start whitespace-normal text-left leading-snug"
            >
              <span className="inline-flex items-center gap-2">
                <Plus size={14} strokeWidth={2.5} aria-hidden="true" />
                Add folder
              </span>
            </ProLockButton>
          </div>

          {index.rootsOverLimit.length > 0 && (
            <p className="mt-1.5 rounded-lg border border-pro-200/30 bg-pro-surface px-2.5 py-1.5 text-[10px] leading-4 text-pro-100">
              This plan covers {index.rootLimit === 1 ? "one folder" : `${index.rootLimit} folders`} at a time.
            </p>
          )}

          {index.unreadable > 0 && (
            <p
              className="mt-1.5 rounded-lg border border-forest-800 bg-forest-950 px-2.5 py-1.5 text-[10px] leading-4 text-mist-500"
              title={index.unreadableSample.join("\n")}
            >
              {index.unreadable === 1 ? "1 folder was" : `${index.unreadable} folders were`} skipped.
            </p>
          )}

          {index.truncated && (
            <p className="mt-1.5 rounded-lg border border-forest-800 bg-forest-950 px-2.5 py-1.5 text-[10px] leading-4 text-mist-500">
              Map capped at {index.projects.length} projects.
            </p>
          )}
        </div>
      </div>

      {/* 2. Verdict Filter Section */}
      {verdictCounts.length > 1 && (
        <div className="shrink-0 pt-4">
          <p className="px-2 pb-2 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-mist-500">
            Verdict
          </p>
          <div className="grid gap-1 min-w-0">
            <FilterRow
              active={activeVerdict === null}
              label="Every verdict"
              count={scopedCount}
              onSelect={() => onActiveVerdict(null)}
            />
            {verdictCounts.map(([verdict, count]) => (
              <FilterRow
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

      {/* 3. Artifact / Ecosystem Filter Section */}
      {categoryCounts.length > 1 && (
        <div className="shrink-0 pt-4">
          <p className="px-2 pb-2 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-mist-500">
            Artifact
          </p>
          <div className="grid gap-1 min-w-0">
            <FilterRow
              active={activeCategory === null}
              label="Every kind"
              count={scopedCount}
              onSelect={() => onActiveCategory(null)}
            />
            {categoryCounts.map(([category, count]) => {
              const presentation = categoryPresentation(category);
              return (
                <FilterRow
                  key={category}
                  active={activeCategory === category}
                  label={presentation.label}
                  icon={presentation.icon}
                  count={count}
                  onSelect={() => onActiveCategory(activeCategory === category ? null : category)}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* 4. Repository Clones Section */}
      {cloneCount > 0 && (
        <div className="shrink-0 pt-4">
          <FilterRow
            active={clonesOnly}
            label="Copies of a repo"
            title="Projects holding a repository that is also checked out somewhere else"
            count={cloneCount}
            onSelect={() => onClonesOnly(!clonesOnly)}
          />
        </div>
      )}

      <div className="flex-1" aria-hidden="true" />
    </aside>
  );
}

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
      className={`group/root flex w-full min-w-0 items-center gap-1 rounded-xl pr-1 transition-all ${
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
        className="flex min-w-0 flex-1 items-center gap-2 px-2.5 py-2 text-left text-xs transition-colors cursor-pointer"
      >
        <Icon
          size={14}
          className={`shrink-0 ${active ? "text-sage-300" : "text-mist-500"}`}
          aria-hidden="true"
        />
        <span
          className={`min-w-0 flex-1 truncate ${
            active ? "font-semibold text-mist-100" : "text-mist-500 group-hover/root:text-mist-100"
          }`}
        >
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
          className="grid size-6 shrink-0 place-items-center rounded-lg text-mist-500 opacity-0 transition-all group-hover/root:opacity-100 hover:bg-forest-900 hover:text-coral-300 cursor-pointer"
        >
          <X size={12} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

function FilterRow({
  active,
  label,
  title,
  count,
  dotClassName,
  icon: Icon,
  onSelect,
}: {
  active: boolean;
  label: string;
  title?: string;
  count: number;
  dotClassName?: string;
  icon?: LucideIcon;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      title={title}
      aria-pressed={active}
      className={`group flex w-full min-w-0 items-center gap-2 rounded-xl px-2.5 py-2 text-left text-xs transition-all cursor-pointer ${
        active
          ? "bg-forest-800 font-semibold text-mist-100 shadow-xs"
          : "text-mist-500 hover:bg-forest-850 hover:text-mist-100"
      }`}
    >
      {dotClassName ? (
        <span className={`size-2 shrink-0 rounded-full ${dotClassName}`} aria-hidden="true" />
      ) : Icon ? (
        <Icon
          size={13}
          className={`shrink-0 ${active ? "text-mist-100" : "text-mist-500 group-hover:text-mist-300"}`}
          aria-hidden="true"
        />
      ) : (
        <span className="size-2 shrink-0 rounded-full bg-transparent" aria-hidden="true" />
      )}
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
