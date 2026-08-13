import { isTauri } from "@tauri-apps/api/core";
import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";
import { CircleAlert, LayoutGrid, LoaderCircle } from "lucide-react";
import { RootPicker } from "../shared/RootPicker";
import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { useWorkspaceIndex } from "../../hooks/useWorkspaceIndex";
import { WorkspaceMap } from "./WorkspaceMap";

type WorkspaceModuleProps = {
  proEnabled: boolean;
};

export function WorkspaceModule({ proEnabled }: WorkspaceModuleProps) {
  const reducedMotion = useReducedMotion();
  const { roots, pickRoot, removeRoot, clearRoots, index, loading, error, scanRoots } = useWorkspaceIndex();
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
      ? <WorkspaceEntry proEnabled={proEnabled} roots={roots} pickRoot={pickRoot} removeRoot={removeRoot} loading={loading} error={error} onScan={(picked) => void scanRoots(picked)} />
      : <WorkspaceMap index={index} loading={loading} query={query} onQueryChange={setQuery} onScan={() => void scanRoots()} onChangeFolder={() => { clearRoots(); setQuery(""); }} onOpenProject={(path) => void openProject(path)} onRevealProject={(path) => void revealProject(path)} proEnabled={proEnabled} />}
    {index && (error || actionError) && <p className="mt-3 flex items-center gap-2 text-sm text-coral-300"><CircleAlert size={15} />{error ?? actionError}</p>}
  </motion.section>;
}

type WorkspaceEntryProps = {
  proEnabled: boolean;
  roots: string[];
  pickRoot: () => Promise<void>;
  removeRoot: (path: string) => void;
  loading: boolean;
  error: string | null;
  onScan: (roots: string[]) => void;
};

function WorkspaceEntry({ proEnabled, roots, pickRoot, removeRoot, loading, error, onScan }: WorkspaceEntryProps) {
  return <div className="mx-auto flex h-full w-full max-w-2xl flex-col items-center justify-center text-center">
    <h1 id="workspace-title" className="text-4xl font-semibold tracking-[-0.05em] text-mist-100 sm:text-5xl">Your projects, in one place.</h1>
    <p className="mx-auto mt-4 max-w-lg text-base leading-7 text-mist-500">See what each project weighs, what can be reclaimed, and what holds work that exists nowhere else.</p>

    <div className="mt-9 w-full">
      <RootPicker
        roots={roots}
        onPick={() => void pickRoot()}
        onRemove={removeRoot}
        proEnabled={proEnabled}
        containerClassName="rounded-xl p-2"
        buttonClassName="size-9 rounded-lg"
      />
    </div>

    <button type="button" onClick={() => onScan(roots)} disabled={loading || roots.length === 0} className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-sage-400 text-sm font-semibold text-forest-950 hover:bg-sage-300 disabled:opacity-50">
      {loading ? <LoaderCircle size={17} className="animate-spin" /> : <LayoutGrid size={17} />}
      {loading ? "Indexing workspace..." : roots.length > 1 ? `Map ${roots.length} workspaces` : "Create project map"}
    </button>

    {!proEnabled && <p className="mt-5 text-xs leading-5 text-mist-500">Reading the map is free. Opening projects, Git actions and reclaiming from here are part of Pro.</p>}

    {error && <p className="mt-4 flex items-center gap-2 text-sm text-coral-300"><CircleAlert size={15} />{error}</p>}
  </div>;
}
