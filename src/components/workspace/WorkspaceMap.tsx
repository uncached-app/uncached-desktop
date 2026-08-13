import { ArrowUpRight, Copy, GitBranch, RefreshCw, Search, X } from "lucide-react";
import { motion } from "motion/react";
import { useMemo, useState, type ReactNode } from "react";
import type { Footprint, Verdict, WorkspaceIndex, WorkspaceProject } from "../../types/workspace";
import { formatBytes } from "../../utils/format";
import { VERDICT_ORDER, VERDICT_PRESENTATION, projectEvidence } from "./verdictPresentation";

type WorkspaceMapProps = {
  index: WorkspaceIndex;
  loading: boolean;
  query: string;
  onQueryChange: (query: string) => void;
  onScan: () => void;
  onOpenProject: (path: string) => void;
  proEnabled: boolean;
  footprints: Record<string, Footprint>;
  measuring: boolean;
  verdicts: Record<string, Verdict>;
};

function rootName(path: string): string {
  const segments = path.split(/[/\\]/).filter(Boolean);
  return segments[segments.length - 1] ?? path;
}

export function WorkspaceMap({
  index,
  loading,
  query,
  onQueryChange,
  onScan,
  onOpenProject,
  proEnabled,
  footprints,
  measuring,
  verdicts,
}: WorkspaceMapProps) {
  const [activeRoot, setActiveRoot] = useState<string | null>(null);
  const normalizedQuery = query.trim().toLowerCase();

  const visible = useMemo(
    () =>
      index.projects.filter((project) => {
        const matchesRoot = !activeRoot || project.root === activeRoot;
        const haystack = `${project.name} ${project.path} ${project.kind} ${project.git.branch ?? ""}`;
        return matchesRoot && (!normalizedQuery || haystack.toLowerCase().includes(normalizedQuery));
      }),
    [index.projects, normalizedQuery, activeRoot],
  );

  const totals = useMemo(
    () =>
      Object.values(footprints).reduce(
        (sum, footprint) => ({
          totalBytes: sum.totalBytes + footprint.totalBytes,
          reclaimableBytes: sum.reclaimableBytes + footprint.reclaimableBytes,
        }),
        { totalBytes: 0, reclaimableBytes: 0 },
      ),
    [footprints],
  );

  const grouped = useMemo(() => {
    const groups = new Map<Verdict, WorkspaceProject[]>();
    for (const project of visible) {
      const verdict = verdicts[project.path] ?? "unknown";
      groups.set(verdict, [...(groups.get(verdict) ?? []), project]);
    }
    for (const projects of groups.values()) {
      projects.sort(
        (left, right) =>
          (footprints[right.path]?.reclaimableBytes ?? 0) - (footprints[left.path]?.reclaimableBytes ?? 0),
      );
    }
    return VERDICT_ORDER.filter((verdict) => groups.has(verdict)).map(
      (verdict) => [verdict, groups.get(verdict) ?? []] as const,
    );
  }, [visible, verdicts, footprints]);

  const atRisk = grouped.find(([verdict]) => verdict === "protect")?.[1].length ?? 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto pb-5">
      <header className="flex flex-wrap items-start justify-between gap-5 border-b border-forest-800 pb-6">
        <div className="min-w-0">
          <h1 id="workspace-title" className="text-3xl font-semibold tracking-[-0.045em] text-mist-100 sm:text-4xl">
            {index.projects.length} {index.projects.length === 1 ? "project" : "projects"}
          </h1>
          <div className="mt-3 flex flex-wrap items-baseline gap-x-6 gap-y-2">
            <Portrait value={formatBytes(totals.totalBytes)} label="on disk" />
            <Portrait value={formatBytes(totals.reclaimableBytes)} label="reclaimable" accent />
            {measuring && (
              <span className="inline-flex items-center gap-1.5 text-[11px] text-mist-500">
                <RefreshCw size={11} className="animate-spin" /> measuring
              </span>
            )}
          </div>
          {atRisk > 0 && (
            <p className="mt-3 text-sm font-medium text-coral-300">
              {atRisk === 1 ? "1 project holds work" : `${atRisk} projects hold work`} that exists only on this disk.
            </p>
          )}
          {index.rootsOverLimit.length > 0 && (
            <p className="mt-3 max-w-xl rounded-lg border border-pro-200/30 bg-pro-surface px-3 py-2 text-xs leading-5 text-pro-100">
              {index.rootsOverLimit.length === 1
                ? "1 folder was not indexed"
                : `${index.rootsOverLimit.length} folders were not indexed`}
              : this plan covers {index.rootLimit === 1 ? "one workspace" : `${index.rootLimit} workspaces`} at a time.
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onScan}
            disabled={loading}
            className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-forest-800 px-3.5 text-xs font-medium text-mist-300 transition-colors hover:bg-forest-850 hover:text-sage-300 disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> {loading ? "Reading..." : "Refresh"}
          </button>
        </div>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-forest-800 py-4">
        {/* Several roots stay separable: triage decides the order, but a project
            never loses the workspace it came from. */}
        <div className="flex flex-wrap items-center gap-1 rounded-lg bg-forest-900 p-1" aria-label="Workspace filter">
          <RootTab active={activeRoot === null} onClick={() => setActiveRoot(null)}>
            All <span className="font-mono text-[10px] opacity-70">{index.projects.length}</span>
          </RootTab>
          {index.roots.length > 1 &&
            index.roots.map((root) => (
              <RootTab key={root} active={activeRoot === root} onClick={() => setActiveRoot(root)} title={root}>
                {rootName(root)}{" "}
                <span className="font-mono text-[10px] opacity-70">
                  {index.projects.filter((project) => project.root === root).length}
                </span>
              </RootTab>
            ))}
        </div>
        <label className="flex min-w-[240px] flex-1 items-center gap-2 rounded-lg border border-forest-800 bg-forest-900 px-3 py-2 sm:max-w-xs">
          <Search size={14} className="shrink-0 text-mist-500" />
          <span className="sr-only">Filter projects</span>
          <input
            value={query}
            onChange={(event) => onQueryChange(event.currentTarget.value)}
            placeholder="Filter projects..."
            className="min-w-0 flex-1 bg-transparent text-xs text-mist-100 outline-none placeholder:text-mist-500"
          />
          {query && (
            <button type="button" onClick={() => onQueryChange("")} aria-label="Clear project filter">
              <X size={14} className="text-mist-500" />
            </button>
          )}
        </label>
      </div>

      <div className="mt-6 grid gap-8">
        {grouped.map(([verdict, projects]) => (
          <VerdictGroup
            key={verdict}
            verdict={verdict}
            projects={projects}
            footprints={footprints}
            showRoot={index.roots.length > 1 && activeRoot === null}
            proEnabled={proEnabled}
            onOpen={onOpenProject}
          />
        ))}
        {visible.length === 0 && (
          <div className="border-t border-forest-800 py-12 text-center">
            <p className="text-sm font-semibold text-mist-300">Nothing matches this filter.</p>
            <p className="mt-1 text-xs text-mist-500">
              {index.projects.length} projects were read across{" "}
              {index.roots.length === 1 ? "one workspace" : `${index.roots.length} workspaces`}.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function Portrait({ value, label, accent = false }: { value: string; label: string; accent?: boolean }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className={`font-mono text-lg font-semibold ${accent ? "text-sage-300" : "text-mist-100"}`}>{value}</span>
      <span className="text-[11px] text-mist-500">{label}</span>
    </span>
  );
}

function RootTab({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`rounded-md px-2.5 py-1.5 text-xs transition-colors ${
        active ? "bg-forest-800 text-mist-100" : "text-mist-500 hover:text-mist-300"
      }`}
    >
      {children}
    </button>
  );
}

function VerdictGroup({
  verdict,
  projects,
  footprints,
  showRoot,
  proEnabled,
  onOpen,
}: {
  verdict: Verdict;
  projects: WorkspaceProject[];
  footprints: Record<string, Footprint>;
  showRoot: boolean;
  proEnabled: boolean;
  onOpen: (path: string) => void;
}) {
  const presentation = VERDICT_PRESENTATION[verdict];
  const reclaimable = projects.reduce(
    (sum, project) => sum + (footprints[project.path]?.reclaimableBytes ?? 0),
    0,
  );

  return (
    <section aria-labelledby={`verdict-${verdict}`}>
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span
          className={`inline-flex items-center gap-2 rounded-md border px-2.5 py-1 text-xs font-semibold ${presentation.className}`}
        >
          <span className={`size-1.5 rounded-full ${presentation.dotClassName}`} aria-hidden="true" />
          <h2 id={`verdict-${verdict}`}>{presentation.label}</h2>
          <span className="font-mono text-[10px] opacity-70">{projects.length}</span>
        </span>
        <p className="text-xs text-mist-500">{presentation.summary}</p>
        {reclaimable > 0 && (
          <span className="ml-auto font-mono text-[11px] text-mist-500">
            {formatBytes(reclaimable)} reclaimable
          </span>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-forest-800 bg-forest-900">
        {projects.map((project, position) => (
          <ProjectRow
            key={project.path}
            project={project}
            verdict={verdict}
            footprint={footprints[project.path] ?? null}
            first={position === 0}
            showRoot={showRoot}
            proEnabled={proEnabled}
            onOpen={() => onOpen(project.path)}
          />
        ))}
      </div>
    </section>
  );
}

function ProjectRow({
  project,
  verdict,
  footprint,
  first,
  showRoot,
  proEnabled,
  onOpen,
}: {
  project: WorkspaceProject;
  verdict: Verdict;
  footprint: Footprint | null;
  first: boolean;
  showRoot: boolean;
  proEnabled: boolean;
  onOpen: () => void;
}) {
  const evidence = projectEvidence(project, verdict, footprint);
  const share = footprint && footprint.totalBytes > 0 ? footprint.reclaimableBytes / footprint.totalBytes : 0;

  return (
    <motion.article
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className={`group grid gap-3 px-4 py-3.5 transition-colors hover:bg-forest-850 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center ${
        first ? "" : "border-t border-forest-800"
      }`}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-medium text-mist-100">{project.name}</span>
          {showRoot && (
            <span className="rounded bg-forest-800 px-1.5 py-0.5 font-mono text-[10px] text-mist-500">
              {rootName(project.root)}
            </span>
          )}
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-mist-500">{project.kind}</span>
          {project.git.branch && (
            <span className="inline-flex items-center gap-1 font-mono text-[10px] text-mist-500">
              <GitBranch size={10} aria-hidden="true" />
              {project.git.branch}
            </span>
          )}
          {project.duplicateOf.length > 0 && (
            <span
              title={project.duplicateOf.join("\n")}
              className="inline-flex items-center gap-1 rounded bg-forest-800 px-1.5 py-0.5 text-[10px] text-mist-300"
            >
              <Copy size={9} aria-hidden="true" />
              {project.duplicateOf.length === 1 ? "1 more copy" : `${project.duplicateOf.length} more copies`}
            </span>
          )}
        </div>
        {/* The sentence is the product: it says what no file manager can. */}
        <p className="mt-1 truncate text-xs text-mist-500">{evidence}</p>
      </div>

      <div className="flex items-center justify-between gap-4 sm:justify-end">
        <span className="w-24 text-right">
          {footprint ? (
            <>
              <span className="block font-mono text-[11px] text-mist-100">{formatBytes(footprint.sourceBytes)}</span>
              <span className="mt-1 block h-1 overflow-hidden rounded-full bg-forest-800">
                <span className="block h-full rounded-full bg-sage-400" style={{ width: `${share * 100}%` }} />
              </span>
            </>
          ) : (
            <span className="font-mono text-[10px] text-mist-500/60">measuring...</span>
          )}
        </span>
        {proEnabled && (
          <button
            type="button"
            onClick={onOpen}
            aria-label={`Open ${project.name}`}
            className="rounded-md p-1.5 text-mist-500 opacity-0 transition-colors hover:bg-forest-800 hover:text-sage-300 group-hover:opacity-100 group-focus-within:opacity-100"
          >
            <ArrowUpRight size={14} />
          </button>
        )}
      </div>
    </motion.article>
  );
}
