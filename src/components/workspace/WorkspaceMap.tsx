import { ArrowUpRight, FolderOpen, GitBranch, MoreHorizontal, RefreshCw, Search, X } from "lucide-react";
import { motion } from "motion/react";
import { useMemo, useState, type ReactNode } from "react";
import type { WorkspaceIndex, WorkspaceProject } from "../../types/workspace";

type WorkspaceMapProps = {
  index: WorkspaceIndex;
  loading: boolean;
  query: string;
  onQueryChange: (query: string) => void;
  onScan: () => void;
  onChangeFolder: () => void;
  onOpenProject: (path: string) => void;
  onRevealProject: (path: string) => void;
  proEnabled: boolean;
};

type MapView = "all" | "attention";

export function WorkspaceMap({ index, loading, query, onQueryChange, onScan, onChangeFolder, onOpenProject, onRevealProject, proEnabled }: WorkspaceMapProps) {
  const [view, setView] = useState<MapView>("all");
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const normalizedQuery = query.trim().toLowerCase();
  const filteredProjects = useMemo(() => index.projects.filter((project) => {
    const matchesQuery = !normalizedQuery || `${project.name} ${project.path} ${project.kind} ${project.branch ?? ""}`.toLowerCase().includes(normalizedQuery);
    return matchesQuery && (view === "all" || project.dirty === true);
  }), [index.projects, normalizedQuery, view]);
  const selectedProject = filteredProjects.find((project) => project.path === selectedPath) ?? filteredProjects[0] ?? null;
  const changedCount = index.projects.filter((project) => project.dirty === true).length;
  const groups = useMemo(() => {
    const grouped = new Map<string, WorkspaceProject[]>();
    for (const project of filteredProjects) grouped.set(project.kind, [...(grouped.get(project.kind) ?? []), project]);
    return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [filteredProjects]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto pb-5">
      <header className="flex flex-wrap items-start justify-between gap-5 border-b border-forest-800 pb-6">
        <div className="min-w-0">
          <p className="truncate font-mono text-[11px] text-mist-500">{index.roots.join("  ·  ")}</p>
          <h1 id="workspace-title" className="mt-3 text-3xl font-semibold tracking-[-0.045em] text-mist-100 sm:text-4xl">Project map</h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-mist-500">Projects discovered {index.roots.length > 1 ? `across ${index.roots.length} workspaces` : "in this workspace"}, grouped by ecosystem.</p>
          {/* Both of these are absences, and an absence explains nothing on its
              own. Named here so a short list never reads as a broken scan. */}
          {index.rootsOverLimit.length > 0 && <p className="mt-2 max-w-xl rounded-lg border border-pro-200/30 bg-pro-surface px-3 py-2 text-xs leading-5 text-pro-100">{index.rootsOverLimit.length === 1 ? "1 folder was not indexed" : `${index.rootsOverLimit.length} folders were not indexed`}: this plan covers {index.rootLimit === 1 ? "one workspace" : `${index.rootLimit} workspaces`} at a time.</p>}
          {index.truncated && <p className="mt-2 max-w-xl text-xs leading-5 text-mist-500">The list stopped at {index.projects.length} projects. Index a narrower folder to see the rest.</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button type="button" onClick={onScan} disabled={loading} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-sage-400 px-3.5 text-xs font-semibold text-forest-950 hover:bg-sage-300 disabled:opacity-50"><RefreshCw size={14} className={loading ? "animate-spin" : ""} /> {loading ? "Scanning..." : "Scan workspace"}</button>
          <button type="button" onClick={onChangeFolder} aria-label="Change workspace folder" className="grid size-10 place-items-center rounded-lg bg-forest-800 text-mist-500 hover:text-mist-100"><MoreHorizontal size={16} /></button>
        </div>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-forest-800 py-4">
        <div className="flex items-center gap-1 rounded-lg bg-forest-900 p-1" aria-label="Project map view">
          <ViewButton active={view === "all"} onClick={() => setView("all")}>All projects <span>{index.projects.length}</span></ViewButton>
          <ViewButton active={view === "attention"} onClick={() => setView("attention")}>Needs attention <span>{changedCount}</span></ViewButton>
        </div>
        <label className="flex min-w-[240px] flex-1 items-center gap-2 rounded-lg border border-forest-800 bg-forest-900 px-3 py-2 sm:max-w-xs"><Search size={14} className="shrink-0 text-mist-500" /><span className="sr-only">Filter projects</span><input value={query} onChange={(event) => onQueryChange(event.currentTarget.value)} placeholder="Filter projects..." className="min-w-0 flex-1 bg-transparent text-xs text-mist-100 outline-none placeholder:text-mist-500" />{query && <button type="button" onClick={() => onQueryChange("")} aria-label="Clear project filter"><X size={14} className="text-mist-500" /></button>}</label>
      </div>

      <div className="mt-6 grid min-h-0 gap-8 lg:grid-cols-[minmax(0,1fr)_260px]">
        <main aria-label="Projects in workspace" className="min-w-0">
          <div className="mb-4 flex items-baseline justify-between gap-3"><h2 className="text-sm font-semibold text-mist-100">Projects</h2><span className="font-mono text-[10px] text-mist-500">{filteredProjects.length} shown</span></div>
          <div className="grid gap-7">{groups.map(([kind, projects]) => <ProjectGroup key={kind} kind={kind} projects={projects} selectedPath={selectedProject?.path ?? null} onSelect={setSelectedPath} onOpen={onOpenProject} proEnabled={proEnabled} />)}</div>
          {filteredProjects.length === 0 && <div className="border-t border-forest-800 py-12 text-center"><p className="text-sm font-semibold text-mist-300">No projects match this view.</p><p className="mt-1 text-xs text-mist-500">Clear the filter or scan another workspace.</p></div>}
        </main>
        {selectedProject && <ProjectInspector project={selectedProject} onOpen={() => onOpenProject(selectedProject.path)} onReveal={() => onRevealProject(selectedProject.path)} proEnabled={proEnabled} />}
      </div>
    </div>
  );
}

function ViewButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return <button type="button" onClick={onClick} className={`rounded-md px-2.5 py-1.5 text-xs ${active ? "bg-forest-800 text-mist-100" : "text-mist-500 hover:text-mist-300"}`}>{children}</button>;
}

function ProjectGroup({ kind, projects, selectedPath, onSelect, onOpen, proEnabled }: { kind: string; projects: WorkspaceProject[]; selectedPath: string | null; onSelect: (path: string) => void; onOpen: (path: string) => void; proEnabled: boolean }) {
  return <section aria-labelledby={`group-${kind}`}><div className="mb-2 flex items-center gap-2"><h3 id={`group-${kind}`} className="font-mono text-[10px] uppercase tracking-[0.16em] text-mist-500">{kind}</h3><span className="font-mono text-[10px] text-mist-500/70">{projects.length}</span></div><div className="overflow-hidden rounded-xl border border-forest-800 bg-forest-900">{projects.map((project, index) => <ProjectRow key={project.path} project={project} selected={selectedPath === project.path} first={index === 0} onSelect={() => onSelect(project.path)} onOpen={() => onOpen(project.path)} proEnabled={proEnabled} />)}</div></section>;
}

function ProjectRow({ project, selected, first, onSelect, onOpen, proEnabled }: { project: WorkspaceProject; selected: boolean; first: boolean; onSelect: () => void; onOpen: () => void; proEnabled: boolean }) {
  return <motion.article initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={onSelect} className={`group grid cursor-pointer gap-3 px-4 py-3.5 transition-colors sm:grid-cols-[minmax(150px,0.8fr)_minmax(160px,1fr)_auto] sm:items-center ${!first ? "border-t border-forest-800" : ""} ${selected ? "bg-sage-400/10" : "hover:bg-forest-850"}`}><div className="flex min-w-0 items-center gap-3"><div className={`grid size-8 shrink-0 place-items-center rounded-lg ${selected ? "bg-sage-400 text-forest-950" : "bg-forest-800 text-sage-300"}`}><FolderOpen size={15} /></div><div className="min-w-0"><p className="truncate text-sm font-medium text-mist-100">{project.name}</p><p className="mt-0.5 truncate font-mono text-[10px] text-mist-500">{project.path}</p></div></div><div className="flex min-w-0 items-center gap-3 text-xs text-mist-500 sm:pl-1">{project.branch ? <span className="inline-flex min-w-0 items-center gap-1.5 truncate font-mono text-[11px]"><GitBranch size={12} className="shrink-0" />{project.branch}</span> : <span>No Git branch</span>}{project.lastCommit && <span className="hidden truncate text-[11px] lg:block">{project.lastCommit}</span>}</div><div className="flex items-center justify-between gap-3 sm:justify-end"><span className={`text-[10px] ${project.dirty ? "text-amber-300" : project.dirty === false ? "text-sage-300" : "text-mist-500"}`}>{project.dirty === null ? "Unknown" : project.dirty ? "Changes" : "Clean"}</span>{proEnabled && <button type="button" onClick={(event) => { event.stopPropagation(); onOpen(); }} aria-label={`Open ${project.name}`} className="rounded-md p-1.5 text-mist-500 opacity-0 hover:bg-forest-800 hover:text-sage-300 group-hover:opacity-100 group-focus-within:opacity-100"><ArrowUpRight size={14} /></button>}</div></motion.article>;
}

function ProjectInspector({ project, onOpen, onReveal, proEnabled }: { project: WorkspaceProject; onOpen: () => void; onReveal: () => void; proEnabled: boolean }) {
  return <aside className="border-t border-forest-800 pt-5 lg:border-l lg:border-t-0 lg:pl-6"><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-mist-500">Selected project</p><h2 className="mt-2 break-words text-xl font-semibold tracking-[-0.03em] text-mist-100">{project.name}</h2><dl className="mt-6 grid gap-4"><InspectorRow label="Ecosystem" value={project.kind} /><InspectorRow label="Branch" value={project.branch ?? "Not detected"} mono /><InspectorRow label="Working tree" value={project.dirty === null ? "Not detected" : project.dirty ? "Changes" : "Clean"} valueClass={project.dirty ? "text-amber-300" : "text-sage-300"} /><InspectorRow label="Last commit" value={project.lastCommit ?? "Not detected"} /></dl>{proEnabled ? <div className="mt-7 grid gap-2"><button type="button" onClick={onOpen} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-sage-400 text-xs font-semibold text-forest-950 hover:bg-sage-300"><FolderOpen size={14} /> Open project</button><button type="button" onClick={onReveal} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-forest-800 text-xs font-medium text-mist-300 hover:text-sage-300">Show in folder</button></div> : <p className="mt-7 rounded-xl border border-pro-200/30 bg-pro-surface px-4 py-3 text-[11px] leading-5 text-pro-100">Everything above is free to read. Opening the project, revealing it and reclaiming from here come with Pro.</p>}<p className="mt-5 break-all border-t border-forest-800 pt-4 font-mono text-[10px] leading-5 text-mist-500">{project.path}</p></aside>;
}

function InspectorRow({ label, value, mono = false, valueClass = "text-mist-300" }: { label: string; value: string; mono?: boolean; valueClass?: string }) {
  return <div><dt className="text-[10px] uppercase tracking-wide text-mist-500">{label}</dt><dd className={`mt-1 truncate text-xs ${mono ? "font-mono" : ""} ${valueClass}`}>{value}</dd></div>;
}
