import {
  Folder,
  Layers,
  Plus,
  X,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useLayoutEffect, useRef, useState, type UIEvent } from "react";
import { useTranslation } from "react-i18next";
import { rootName } from "./naming";
import { ProLockButton } from "../../shared/ProLockButton";
import { VERDICT_PRESENTATION } from "../verdictPresentation";
import { translatedCategoryPresentation } from "../../findings/categoryPresentation";
import type { Verdict, WorkspaceIndex } from "../../../types/workspace";

type WorkspaceSidebarProps = {
  index: WorkspaceIndex;
  chosenRoots: string[];
  countByRoot: Map<string, number>;
  activeRoot: string | null;
  onActiveRoot: (root: string | null) => void;
  verdictCounts: ReadonlyArray<readonly [Verdict, number]>;
  /** What clearing the verdict would leave, so "Every verdict" adds up to its rows. */
  verdictTotal: number;
  /** Likewise for the artifact kinds. A project holding two kinds is in two rows,
      so this is not their sum and never was. */
  categoryTotal: number;
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
  /** A folder's own verbs, at the pointer. */
  onFolderMenu: (path: string, name: string, event: React.MouseEvent) => void;
};

/**
 * Workspace filter sidebar with clean, non-overflowing layout.
 */
export function WorkspaceSidebar({
  index,
  chosenRoots,
  countByRoot,
  activeRoot,
  onActiveRoot,
  verdictCounts,
  verdictTotal,
  categoryTotal,
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
  onFolderMenu,
}: WorkspaceSidebarProps) {
  const { t } = useTranslation();
  const singleRoot = chosenRoots.length === 1;
  const scroller = useRef<HTMLDivElement>(null);
  const [moreBelow, setMoreBelow] = useState(false);
  const measure = useCallback((element: HTMLDivElement | null) => {
    if (!element) return;
    // 1px of slack: fractional scroll positions never quite reach the end.
    setMoreBelow(element.scrollTop + element.clientHeight < element.scrollHeight - 1);
  }, []);
  useLayoutEffect(() => {
    const element = scroller.current;
    measure(element);
    if (!element) return;
    const observer = new ResizeObserver(() => measure(element));
    observer.observe(element);
    return () => observer.disconnect();
  }, [measure, index, chosenRoots]);

  return (
    // `h-full min-h-0` and not just `overflow-y-auto`: a column with no height
    // to be shorter than grows to its content and is clipped by the row it sits
    // in, which is a scroller that never scrolls. It had one the whole time.
    <aside
      className="flex h-full min-h-0 w-52 shrink-0 select-none flex-col overflow-hidden pe-2 sm:w-60"
      aria-label={t("workspace.sidebar.label")}
    >

      {/* 1. Folders Section */}
      <div className="shrink-0 pb-2">
        <p className="px-2 pb-2 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-mist-500">
          {t("workspace.sidebar.folders")}
        </p>

        <div className="grid gap-1 min-w-0">
          {!singleRoot && (
            <RootItem
              active={activeRoot === null}
              label={t("workspace.sidebar.allProjects")}
              count={index.projects.length}
              icon={Layers}
              onSelect={() => onActiveRoot(null)}
              onRemove={onRemoveAllRoots}
              removeLabel={t("workspace.sidebar.removeAll", { count: chosenRoots.length })}
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
              onFolderMenu={(event) => onFolderMenu(root, rootName(root), event)}
            />
          ))}

          <div className="pt-1.5">
            <ProLockButton
              label={t("workspace.sidebar.addAnother")}
              reason={t("workspace.sidebar.addReason")}
              locked={!proEnabled && chosenRoots.length > 0}
              onClick={onAddRoot}
              containerClassName="w-full"
              className="w-full rounded-xl border border-forest-800/80 bg-forest-900 px-3 py-2 text-xs font-medium text-mist-300 hover:border-sage-400/60 hover:bg-forest-850 hover:text-mist-100 cursor-pointer"
              tooltipClassName="inset-x-0 items-start whitespace-normal text-start leading-snug"
            >
              <span className="inline-flex items-center gap-2">
                <Plus size={14} strokeWidth={2.5} aria-hidden="true" />
                {t("workspace.sidebar.addFolder")}
              </span>
            </ProLockButton>
          </div>

          {index.rootsOverLimit.length > 0 && (
            <p className="mt-1.5 rounded-lg border border-pro-200/30 bg-pro-surface px-2.5 py-1.5 text-[10px] leading-4 text-pro-100">
              {t("workspace.sidebar.rootLimit", { count: index.rootLimit })}
            </p>
          )}

          {index.unreadable > 0 && (
            <p
              className="mt-1.5 rounded-lg border border-forest-800 bg-forest-950 px-2.5 py-1.5 text-[10px] leading-4 text-mist-500"
              title={index.unreadableSample.join("\n")}
            >
              {t("workspace.sidebar.skipped", { count: index.unreadable })}
            </p>
          )}

          {index.truncated && (
            <p className="mt-1.5 rounded-lg border border-forest-800 bg-forest-950 px-2.5 py-1.5 text-[10px] leading-4 text-mist-500">
              {t("workspace.sidebar.capped", { count: index.projects.length })}
            </p>
          )}
        </div>
      </div>

      {/* The folders stay put and the filters move under them. Which folder is
          being read is the question every one of these answers within, so
          scrolling the filters out of reach of it would be scrolling away the
          thing that gives them their meaning. */}
      <div
        ref={scroller}
        onScroll={(event: UIEvent<HTMLDivElement>) => measure(event.currentTarget)}
        className={`min-h-0 flex-1 overflow-y-auto overflow-x-hidden pe-1 scrollbar-gutter-stable ${
          moreBelow ? "[mask-image:linear-gradient(to_bottom,black_calc(100%-2rem),transparent)]" : ""
        }`}
      >

      {/* 2. Verdict Filter Section */}
      {/* Or while one is on: a section that vanishes because the filter inside
          it left nothing is a filter with no way back off. */}
      {(verdictCounts.length > 1 || activeVerdict !== null) && (
        <div className="shrink-0 pt-4">
          <p className="px-2 pb-2 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-mist-500">
            {t("workspace.sidebar.verdict")}
          </p>
          <div className="grid gap-1 min-w-0">
            <FilterRow
              active={activeVerdict === null}
              label={t("workspace.sidebar.everyVerdict")}
              count={verdictTotal}
              onSelect={() => onActiveVerdict(null)}
            />
            {verdictCounts.map(([verdict, count]) => (
              <FilterRow
                key={verdict}
                active={activeVerdict === verdict}
                label={t(VERDICT_PRESENTATION[verdict].labelKey)}
                title={t(VERDICT_PRESENTATION[verdict].summaryKey)}
                dotClassName={VERDICT_PRESENTATION[verdict].dotClassName}
                count={count}
                onSelect={() => onActiveVerdict(activeVerdict === verdict ? null : verdict)}
              />
            ))}
          </div>
        </div>
      )}

      {/* 3. Artifact / Ecosystem Filter Section */}
      {(categoryCounts.length > 1 || activeCategory !== null) && (
        <div className="shrink-0 pt-4">
          <p className="px-2 pb-2 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-mist-500">
            {t("workspace.sidebar.artifact")}
          </p>
          <div className="grid gap-1 min-w-0">
            <FilterRow
              active={activeCategory === null}
              label={t("workspace.sidebar.everyKind")}
              count={categoryTotal}
              onSelect={() => onActiveCategory(null)}
            />
            {categoryCounts.map(([category, count]) => {
              const presentation = translatedCategoryPresentation(category, t);
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
      {(cloneCount > 0 || clonesOnly) && (
        <div className="shrink-0 pt-4">
          <FilterRow
            active={clonesOnly}
            label={t("workspace.filters.clones")}
            title={t("workspace.sidebar.clonesTitle")}
            count={cloneCount}
            onSelect={() => onClonesOnly(!clonesOnly)}
          />
        </div>
      )}

      </div>
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
  onFolderMenu,
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
  /** A real directory's own verbs. Absent on "All projects", which is not one. */
  onFolderMenu?: (event: React.MouseEvent) => void;
  removeLabel?: string;
}) {
  const { t } = useTranslation();

  return (
    <div
      onContextMenu={onFolderMenu}
      className={`group/root flex w-full min-w-0 items-center gap-1 rounded-xl pe-1 transition-all ${
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
        className="flex min-w-0 flex-1 items-center gap-2 px-2.5 py-2 text-start text-xs transition-colors cursor-pointer"
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
          aria-label={removeLabel ?? t("workspace.sidebar.remove", { label })}
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
      className={`group flex w-full min-w-0 items-center gap-2 rounded-xl px-2.5 py-2 text-start text-xs transition-all cursor-pointer ${
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
