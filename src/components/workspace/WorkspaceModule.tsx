import { isTauri } from "@tauri-apps/api/core";
import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";
import { ArrowRight, CircleAlert, FolderOpen, LayoutGrid, LoaderCircle, LockKeyhole } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { useWorkspaceIndex } from "../../hooks/useWorkspaceIndex";
import { openExternalUrl } from "../../utils/externalLink";
import { WorkspaceMap } from "./WorkspaceMap";

type WorkspaceModuleProps = {
  proEnabled: boolean;
  rootPath: string;
  setRootPath: (path: string) => void;
  pickFolder: () => void;
};

export function WorkspaceModule({ proEnabled, rootPath, setRootPath, pickFolder }: WorkspaceModuleProps) {
  const reducedMotion = useReducedMotion();
  const { index, loading, error, scanRoot } = useWorkspaceIndex(proEnabled, rootPath);
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
    {!index ? <WorkspaceEntry proEnabled={proEnabled} rootPath={rootPath} setRootPath={setRootPath} pickFolder={pickFolder} loading={loading} error={error} scanRoot={scanRoot} /> : <WorkspaceMap index={index} loading={loading} query={query} onQueryChange={setQuery} onScan={() => void scanRoot()} onChangeFolder={() => { setRootPath(""); setQuery(""); }} onOpenProject={(path) => void openProject(path)} onRevealProject={(path) => void revealProject(path)} />}
    {index && (error || actionError) && <p className="mt-3 flex items-center gap-2 text-sm text-coral-300"><CircleAlert size={15} />{error ?? actionError}</p>}
  </motion.section>;
}

function WorkspaceEntry({ proEnabled, rootPath, setRootPath, pickFolder, loading, error, scanRoot }: { proEnabled: boolean; rootPath: string; setRootPath: (path: string) => void; pickFolder: () => void; loading: boolean; error: string | null; scanRoot: () => Promise<void> }) {
  return <div className="mx-auto flex h-full w-full max-w-2xl flex-col items-center justify-center text-center"><h1 id="workspace-title" className="text-4xl font-semibold tracking-[-0.05em] text-mist-100 sm:text-5xl">Your projects, in one place.</h1><p className="mx-auto mt-4 max-w-lg text-base leading-7 text-mist-500">Organize local projects, see their Git context, and keep every workspace easy to find.</p>{proEnabled ? <form onSubmit={(event) => { event.preventDefault(); void scanRoot(); }} className="mt-9 w-full"><div className="group flex items-center gap-2 rounded-xl border border-forest-800 bg-forest-900 p-2 text-left focus-within:border-sage-400 focus-within:ring-2 focus-within:ring-sage-400/20"><FolderOpen size={18} className="ml-3 shrink-0 text-mist-500" /><input value={rootPath} onChange={(event) => setRootPath(event.currentTarget.value)} placeholder="Select or paste folder path..." className="min-w-0 flex-1 bg-transparent px-2 py-3 font-mono text-sm text-mist-100 outline-none placeholder:font-sans placeholder:text-mist-500/50" spellCheck={false} /><button type="button" onClick={pickFolder} className="rounded-lg bg-forest-800 px-3 py-2 text-xs font-medium text-mist-300 hover:text-sage-300">Browse</button></div><button type="submit" disabled={loading} className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-sage-400 text-sm font-semibold text-forest-950 hover:bg-sage-300 disabled:opacity-50">{loading ? <LoaderCircle size={17} className="animate-spin" /> : <LayoutGrid size={17} />}{loading ? "Indexing workspace..." : "Create project map"}</button></form> : <div className="mt-8 flex items-center gap-4 rounded-2xl border border-pro-200/30 bg-pro-surface p-4 text-left"><LockKeyhole size={18} className="shrink-0 text-pro-100" /><div><p className="text-sm font-semibold text-mist-100">The project map is a Pro module</p><p className="mt-1 text-xs leading-5 text-mist-500">Unlock project organization, Git context, and workspace maintenance.</p></div><button type="button" onClick={() => openExternalUrl("https://uncached.app/pro")} className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-pro-200 px-3 py-2 text-xs font-semibold text-forest-950">Get Pro <ArrowRight size={13} /></button></div>}{error && <p className="mt-4 flex items-center gap-2 text-sm text-coral-300"><CircleAlert size={15} />{error}</p>}</div>;
}
