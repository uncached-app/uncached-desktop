import { isTauri } from "@tauri-apps/api/core";
import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";
import { CircleAlert, FolderOpen, LayoutGrid, LoaderCircle, Plus, X } from "lucide-react";
import { ProLockButton } from "../shared/ProLockButton";
import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { useWorkspaceIndex } from "../../hooks/useWorkspaceIndex";
import { WorkspaceMap } from "./WorkspaceMap";

type WorkspaceModuleProps = {
  proEnabled: boolean;
  rootPath: string;
  setRootPath: (path: string) => void;
  pickFolder: () => void;
};

export function WorkspaceModule({ proEnabled, rootPath, setRootPath, pickFolder }: WorkspaceModuleProps) {
  const reducedMotion = useReducedMotion();
  const { roots, pickAdditionalRoot, removeRoot, clearRoots, index, loading, error, scanRoots } = useWorkspaceIndex();
  const [actionError, setActionError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  async function openProject(path: string) {
    setActionError(null);
    try { if (isTauri()) await openPath(path); else window.open(path, "_blank", "noreferrer"); }
    catch (openError) { setActionError(openError instanceof Error ? openError.message : String(openError)); }
  }

  async function revealProject(path: string) {
    setActionError(null);
    try { if (isTauri()) await revealItemInDir(path); else window.open(path, "_blank", "noreferrer"); }
    catch (revealError) { setActionError(revealError instanceof Error ? revealError.message : String(revealError)); }
  }

  return <motion.section initial={reducedMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }} className="flex h-full w-full min-h-0 flex-col overflow-hidden" aria-labelledby="workspace-title">
    {!index
      ? <WorkspaceEntry proEnabled={proEnabled} rootPath={rootPath} setRootPath={setRootPath} pickFolder={pickFolder} roots={roots} pickAdditionalRoot={pickAdditionalRoot} removeRoot={removeRoot} loading={loading} error={error} onScan={(picked) => void scanRoots(picked)} />
      : <WorkspaceMap index={index} loading={loading} query={query} onQueryChange={setQuery} onScan={() => void scanRoots()} onChangeFolder={() => { clearRoots(); setQuery(""); }} onOpenProject={(path) => void openProject(path)} onRevealProject={(path) => void revealProject(path)} proEnabled={proEnabled} />}
    {index && (error || actionError) && <p className="mt-3 flex items-center gap-2 text-sm text-coral-300"><CircleAlert size={15} />{error ?? actionError}</p>}
  </motion.section>;
}

type WorkspaceEntryProps = {
  proEnabled: boolean;
  rootPath: string;
  setRootPath: (path: string) => void;
  pickFolder: () => void;
  roots: string[];
  pickAdditionalRoot: (pending: string) => Promise<void>;
  removeRoot: (path: string) => void;
  loading: boolean;
  error: string | null;
  onScan: (roots: string[]) => void;
};

function WorkspaceEntry({ proEnabled, rootPath, setRootPath, pickFolder, roots, pickAdditionalRoot, removeRoot, loading, error, onScan }: WorkspaceEntryProps) {
  const pending = rootPath.trim();
  // The field counts as a root, so one folder needs no list and no `+`.
  const pickedRoots = pending && !roots.includes(pending) ? [...roots, pending] : roots;

  return <div className="mx-auto flex h-full w-full max-w-2xl flex-col items-center justify-center text-center">
    <h1 id="workspace-title" className="text-4xl font-semibold tracking-[-0.05em] text-mist-100 sm:text-5xl">Your projects, in one place.</h1>
    <p className="mx-auto mt-4 max-w-lg text-base leading-7 text-mist-500">See what each project weighs, what can be reclaimed, and what holds work that exists nowhere else.</p>

    <form onSubmit={(event) => { event.preventDefault(); onScan(pickedRoots); }} className="mt-9 w-full">
      <div className="group flex items-center gap-2 rounded-xl border border-forest-800 bg-forest-900 p-2 text-left focus-within:border-sage-400 focus-within:ring-2 focus-within:ring-sage-400/20">
        <FolderOpen size={18} className="ml-3 shrink-0 text-mist-500" />
        <input
          value={rootPath}
          onChange={(event) => setRootPath(event.currentTarget.value)}
          placeholder="Select or paste folder path..."
          className="min-w-0 flex-1 bg-transparent px-2 py-3 font-mono text-sm text-mist-100 outline-none placeholder:font-sans placeholder:text-mist-500/50"
          spellCheck={false}
        />
        <button type="button" onClick={pickFolder} className="rounded-lg bg-forest-800 px-3 py-2 text-xs font-medium text-mist-300 hover:text-sage-300">Browse</button>
        {(pending || roots.length > 0) && (
          <ProLockButton
            label="Add another workspace"
            reason="Mapping several workspaces at once is part of Pro"
            locked={!proEnabled}
            onClick={() => void pickAdditionalRoot(pending).then(() => setRootPath(""))}
            className="size-9 rounded-lg"
          >
            <Plus size={15} />
          </ProLockButton>
        )}
      </div>
    </form>

    {roots.length > 0 && <ul className="mt-3 grid w-full gap-1.5 text-left">
      {roots.map((root) => <li key={root} className="flex items-center gap-2 rounded-lg border border-forest-800 bg-forest-900 px-3 py-2">
        <FolderOpen size={13} className="shrink-0 text-sage-300" />
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-mist-300">{root}</span>
        <button type="button" onClick={() => removeRoot(root)} aria-label={`Remove ${root}`} className="shrink-0 rounded-md p-1 text-mist-500 hover:text-coral-300"><X size={13} /></button>
      </li>)}
    </ul>}

    <button type="button" onClick={() => onScan(pickedRoots)} disabled={loading || pickedRoots.length === 0} className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-sage-400 text-sm font-semibold text-forest-950 hover:bg-sage-300 disabled:opacity-50">
      {loading ? <LoaderCircle size={17} className="animate-spin" /> : <LayoutGrid size={17} />}
      {loading ? "Indexing workspace..." : pickedRoots.length > 1 ? `Map ${pickedRoots.length} workspaces` : "Create project map"}
    </button>

    {!proEnabled && <p className="mt-5 text-xs leading-5 text-mist-500">Reading the map is free. Opening projects, Git actions and reclaiming from here are part of Pro.</p>}

    {error && <p className="mt-4 flex items-center gap-2 text-sm text-coral-300"><CircleAlert size={15} />{error}</p>}
  </div>;
}
