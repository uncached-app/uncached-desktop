import { type FormEvent, useEffect, useRef, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import {
  AlertTriangle,
  Ban,
  Check,
  FolderOpen,
  FolderSearch,
  LoaderCircle,
  RefreshCw,
  ScanSearch,
  Trash2,
  X,
} from "lucide-react";

type Category = string;

type ScanTarget = {
  id: string;
  path: string;
  name: string;
  category: Category;
  sizeBytes: number;
  sizeHasErrors: boolean;
  sizePending: boolean;
  formattedSize: string;
  lastModified: string | null;
};

type ScanStartResult = { scanId: string };
type ScanStarted = { scanId: string; rootPath: string };
type ScanProgress = {
  scanId: string;
  directoriesScanned: number;
  targetsFound: number;
  totalBytesFound: number;
};
type TargetFound = { scanId: string; target: ScanTarget };
type TargetSized = {
  scanId: string;
  targetId: string;
  sizeBytes: number;
  sizeHasErrors: boolean;
  sizePending: boolean;
  formattedSize: string;
};
type ScanFinished = {
  scanId: string;
  totalTargets: number;
  totalBytesFound: number;
  durationMs: number;
};
type ScanCancelled = {
  scanId: string;
  totalTargets: number;
  totalBytesFound: number;
};
type PendingScanEvent =
  | { kind: "target"; payload: TargetFound }
  | { kind: "sized"; payload: TargetSized }
  | { kind: "progress"; payload: ScanProgress }
  | { kind: "finished"; payload: ScanFinished }
  | { kind: "cancelled"; payload: ScanCancelled }
  | { kind: "failed"; payload: { scanId: string; message: string } };

function App() {
  const [rootPath, setRootPath] = useState("");
  const [targets, setTargets] = useState<ScanTarget[]>([]);
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [status, setStatus] = useState("Ready to scan");
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [listenersReady, setListenersReady] = useState(false);
  const [cleaningTargetIds, setCleaningTargetIds] = useState<Set<string>>(new Set());
  const [deletingAll, setDeletingAll] = useState(false);
  const activeScanId = useRef<string | null>(null);
  const pendingScan = useRef(false);
  const pendingEvents = useRef<PendingScanEvent[]>([]);
  const pendingSizeUpdates = useRef<Map<string, TargetSized>>(new Map());

  function acceptsScanEvent(scanId: string) {
    return activeScanId.current === scanId;
  }

  function handleScanEvent(event: PendingScanEvent) {
    if (activeScanId.current === null) {
      if (pendingScan.current) pendingEvents.current.push(event);
      return;
    }
    if (!acceptsScanEvent(event.payload.scanId)) return;

    if (event.kind === "target") {
      const sizeUpdate = pendingSizeUpdates.current.get(event.payload.target.id);
      pendingSizeUpdates.current.delete(event.payload.target.id);
      setTargets((current) => {
        const target = sizeUpdate
          ? {
              ...event.payload.target,
              sizeBytes: sizeUpdate.sizeBytes,
              sizeHasErrors: sizeUpdate.sizeHasErrors,
              sizePending: sizeUpdate.sizePending,
              formattedSize: sizeUpdate.formattedSize,
            }
          : event.payload.target;
        return current.some((item) => item.id === target.id) ? current : [...current, target];
      });
    } else if (event.kind === "sized") {
      setTargets((current) => {
        if (!current.some((target) => target.id === event.payload.targetId)) {
          pendingSizeUpdates.current.set(event.payload.targetId, event.payload);
          return current;
        }
        return current.map((target) =>
            target.id === event.payload.targetId
              ? {
                  ...target,
                  sizeBytes: event.payload.sizeBytes,
                  sizeHasErrors: event.payload.sizeHasErrors,
                  sizePending: event.payload.sizePending,
                  formattedSize: event.payload.formattedSize,
                }
              : target,
          );
      });
    } else if (event.kind === "progress") {
      setProgress(event.payload);
    } else if (event.kind === "finished") {
      pendingScan.current = false;
      setScanning(false);
      setStatus(`Scan complete in ${event.payload.durationMs} ms`);
    } else if (event.kind === "cancelled") {
      pendingScan.current = false;
      pendingEvents.current = [];
      activeScanId.current = null;
      setScanning(false);
      setCancelling(false);
      setTargets([]);
      setProgress(null);
      setStatus("Scan cancelled");
    } else {
      pendingScan.current = false;
      setScanning(false);
      setStatus("Scan failed");
      setError(event.payload.message);
    }
  }

  useEffect(() => {
    let disposed = false;

    if (!isTauri()) {
      setError("Tauri runtime unavailable. Start the app with `pnpm tauri dev`.");
      return;
    }

    const listeners = Promise.all([
      listen<ScanStarted>("scan:started", ({ payload }) => {
        if (acceptsScanEvent(payload.scanId)) setStatus("Scanning workspace...");
      }),
      listen<TargetFound>("scan:target_found", ({ payload }) => {
        handleScanEvent({ kind: "target", payload });
      }),
      listen<TargetSized>("scan:target_sized", ({ payload }) => {
        handleScanEvent({ kind: "sized", payload });
      }),
      listen<ScanProgress>("scan:progress", ({ payload }) => {
        handleScanEvent({ kind: "progress", payload });
      }),
      listen<ScanFinished>("scan:finished", ({ payload }) => {
        handleScanEvent({ kind: "finished", payload });
      }),
      listen<ScanCancelled>("scan:cancelled", ({ payload }) => {
        handleScanEvent({ kind: "cancelled", payload });
      }),
      listen<{ scanId: string; message: string }>("scan:failed", ({ payload }) => {
        handleScanEvent({ kind: "failed", payload });
      }),
    ]);

    listeners
      .then(() => {
        if (!disposed) setListenersReady(true);
      })
      .catch((listenerError) => {
        if (!disposed) setError(String(listenerError));
      });

    return () => {
      disposed = true;
      listeners.then((unlisten) => unlisten.forEach((stop) => stop()));
    };
  }, []);

  async function startScan(event: FormEvent) {
    event.preventDefault();
    if (!rootPath.trim() || scanning) return;

    setError(null);
    setTargets([]);
    pendingSizeUpdates.current.clear();
    setProgress(null);
    setScanning(true);
    setStatus("Scanning workspace...");
    activeScanId.current = null;
    pendingScan.current = true;
    pendingEvents.current = [];

    try {
      const result = await invoke<ScanStartResult>("start_scan", {
        path: rootPath.trim(),
      });
      activeScanId.current = result.scanId;
      pendingScan.current = false;
      const events = pendingEvents.current;
      pendingEvents.current = [];
      events.forEach(handleScanEvent);
    } catch (scanError) {
      setScanning(false);
      activeScanId.current = null;
      pendingScan.current = false;
      pendingEvents.current = [];
      setError(String(scanError));
    }
  }

  async function pickFolder() {
    setError(null);
    if (!isTauri()) {
      setError("Tauri runtime unavailable. Start the app with `pnpm tauri dev`.");
      return;
    }

    try {
      const selected = await open({ directory: true, multiple: false });
      if (typeof selected === "string") setRootPath(selected);
    } catch (pickerError) {
      setError(String(pickerError));
    }
  }

  async function cancelScan() {
    const scanId = activeScanId.current;
    if (!scanId || !scanning || cancelling) return;

    setCancelling(true);
    setError(null);
    setStatus("Cancelling scan...");
    try {
      const result = await invoke<{ cancelled: boolean }>("cancel_scan", { scanId });
      if (result.cancelled) {
        activeScanId.current = null;
        pendingScan.current = false;
        pendingEvents.current = [];
        setTargets([]);
        pendingSizeUpdates.current.clear();
        setProgress(null);
        setScanning(false);
        setCancelling(false);
        setStatus("Scan cancelled");
      } else {
        setCancelling(false);
        setStatus("Scan already complete");
      }
    } catch (cancelError) {
      setCancelling(false);
      setError(String(cancelError));
    }
  }

  async function moveToTrash(targetId: string) {
    if (cleaningTargetIds.has(targetId)) return;
    setError(null);
    setCleaningTargetIds((current) => new Set(current).add(targetId));
    try {
      await invoke("clean_target", {
        request: {
          targetId,
          mode: "Trash",
          confirmation: null,
        },
      });
      setTargets((current) => current.filter((target) => target.id !== targetId));
    } catch (cleanError) {
      setError(String(cleanError));
    } finally {
      setCleaningTargetIds((current) => {
        const next = new Set(current);
        next.delete(targetId);
        return next;
      });
    }
  }

  async function refreshTargetSize(targetId: string) {
    setError(null);
    setTargets((current) => current.map((target) => target.id === targetId
      ? { ...target, sizePending: true, sizeHasErrors: false }
      : target));
    try {
      await invoke("retry_target_size", { targetId });
    } catch (sizeError) {
      setTargets((current) => current.map((target) => target.id === targetId
        ? { ...target, sizePending: false, sizeHasErrors: true }
        : target));
      setError(String(sizeError));
    }
  }

  async function deleteAll() {
    if (scanning || deletingAll || targets.some((target) => target.sizePending || target.sizeHasErrors)) return;
    setDeletingAll(true);
    try {
      for (const target of targets) await moveToTrash(target.id);
    } finally {
      setDeletingAll(false);
    }
  }

  const sizesReady = targets.length > 0 && targets.every((target) => !target.sizePending && !target.sizeHasErrors);
  const deleteAllDisabled = scanning || deletingAll || !sizesReady;
  const deleteAllLoading = scanning || deletingAll || targets.some((target) => target.sizePending);

  return (
    <main className="h-screen overflow-hidden bg-forest-950 text-mist-100">
      <div className="mx-auto flex h-full w-full max-w-6xl flex-col overflow-hidden px-5 py-5 sm:px-8 lg:px-12">
        <header className="flex items-center justify-between border-b border-white/8 pb-5">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-xl border border-sage-400/30 bg-sage-400/10 text-sage-300">
              <FolderOpen size={18} strokeWidth={1.8} aria-hidden="true" />
            </span>
            <div>
              <p className="text-sm font-semibold tracking-[0.12em] text-mist-100">UNCACHED</p>
              <p className="text-xs text-mist-500">A calmer way to reclaim space</p>
            </div>
          </div>
          <span className="hidden rounded-full border border-white/8 px-3 py-1 text-xs text-mist-500 sm:inline-flex">
            Local & private
          </span>
        </header>

        <section className="grid shrink-0 gap-8 py-9 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-14 lg:py-12">
          <div className="max-w-xl">
            <p className="mb-5 text-xs font-medium uppercase tracking-[0.22em] text-sage-400">Workspace care</p>
            <h1 className="max-w-lg text-5xl font-semibold leading-[0.96] tracking-[-0.06em] text-mist-100 sm:text-6xl">
              Make room for what matters.
            </h1>
            <p className="mt-6 max-w-md text-base leading-7 text-mist-500 sm:text-lg">
              Find disposable project artifacts, review what is safe, and reclaim space without guessing.
            </p>
            <div className="mt-8 flex flex-wrap gap-5 text-sm text-mist-500">
              <span className="inline-flex items-center gap-2"><Check size={16} className="text-sage-400" /> Rust-validated cleanup</span>
              <span className="inline-flex items-center gap-2"><Check size={16} className="text-sage-400" /> No cloud uploads</span>
            </div>
          </div>

          <form onSubmit={startScan} className="rounded-3xl border border-white/10 bg-forest-900/80 p-5 shadow-2xl shadow-black/20 sm:p-7">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-mist-100">Choose a workspace</p>
                <p className="mt-1 text-sm leading-6 text-mist-500">Pick a folder or paste its path below.</p>
              </div>
              <FolderSearch size={21} className="shrink-0 text-sage-400" strokeWidth={1.7} aria-hidden="true" />
            </div>

            <label htmlFor="root-path" className="mb-2 block text-xs font-medium uppercase tracking-[0.14em] text-mist-500">Workspace root</label>
            <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-forest-950/70 p-2 transition-colors focus-within:border-sage-400/70 focus-within:ring-4 focus-within:ring-sage-400/10">
              <FolderOpen size={18} className="ml-2 shrink-0 text-mist-500" strokeWidth={1.8} aria-hidden="true" />
              <input
                id="root-path"
                className="min-w-0 flex-1 bg-transparent px-2 py-3 text-sm text-mist-100 outline-none placeholder:text-mist-500/60"
                value={rootPath}
                onChange={(event) => setRootPath(event.currentTarget.value)}
                placeholder="D:\\Projects"
                spellCheck={false}
              />
              <button type="button" onClick={pickFolder} className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-white/10 px-3 py-2.5 text-sm font-medium text-mist-300 hover:border-sage-400/50 hover:bg-sage-400/10 hover:text-sage-300" aria-label="Browse for a folder">
                <FolderOpen size={16} strokeWidth={1.8} aria-hidden="true" />
                <span className="hidden sm:inline">Browse</span>
              </button>
            </div>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <button type="submit" disabled={!listenersReady || scanning || !rootPath.trim()} className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-sage-400 px-5 text-sm font-semibold text-forest-950 hover:bg-sage-300 disabled:cursor-wait disabled:opacity-50">
                {scanning ? <LoaderCircle size={17} className="animate-spin" aria-hidden="true" /> : <ScanSearch size={17} aria-hidden="true" />}
                {scanning ? "Scanning" : "Scan workspace"}
              </button>
              {scanning && (
                <button type="button" disabled={cancelling} onClick={cancelScan} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-coral-300/30 px-5 text-sm font-medium text-coral-300 hover:bg-coral-300/10 disabled:cursor-wait disabled:opacity-50">
                  <Ban size={17} aria-hidden="true" />
                  {cancelling ? "Cancelling..." : "Cancel scan"}
                </button>
              )}
            </div>

            <div className="mt-5 flex min-h-6 items-center gap-2 text-sm text-mist-500" aria-live="polite">
              {scanning ? <LoaderCircle size={15} className="animate-spin text-sage-400" aria-hidden="true" /> : status === "Scan cancelled" ? <Ban size={15} className="text-mist-500" aria-hidden="true" /> : <span className="size-2 rounded-full bg-sage-400/70" aria-hidden="true" />}
              <span>{status}</span>
              {progress && <span className="ml-auto font-mono text-xs text-mist-500">{progress.directoriesScanned.toLocaleString()} dirs · {progress.targetsFound} targets</span>}
            </div>
          </form>
        </section>

        {error && <div className="mb-8 flex items-start gap-3 rounded-2xl border border-coral-300/25 bg-coral-300/8 p-4 text-sm text-coral-300" role="alert"><AlertTriangle size={18} className="mt-0.5 shrink-0" aria-hidden="true" /><span>{error}</span></div>}

        <section aria-label="Scan targets" className="flex min-h-0 flex-1 flex-col overflow-hidden border-t border-white/8 py-7 sm:py-9">
          <div className="mb-6 flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-sage-400">Findings</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-mist-100 sm:text-3xl">Disposable artifacts</h2>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={deleteAll}
                disabled={deleteAllDisabled}
                className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-coral-300/30 px-3 text-sm font-medium text-coral-300 hover:bg-coral-300/10 disabled:cursor-wait disabled:opacity-40"
              >
                {deleteAllLoading ? <LoaderCircle size={16} className="animate-spin" aria-hidden="true" /> : <Trash2 size={16} aria-hidden="true" />}
                <span className="hidden sm:inline">Delete all</span>
              </button>
              <span className="grid size-10 place-items-center rounded-full border border-sage-400/25 bg-sage-400/8 font-mono text-sm text-sage-300">{targets.length}</span>
            </div>
          </div>

          {targets.length === 0 ? (
            <div className="grid min-h-52 place-items-center rounded-3xl border border-dashed border-white/12 bg-forest-900/30 px-6 py-10 text-center">
              <div>
                <FolderSearch size={30} className="mx-auto text-mist-500" strokeWidth={1.5} aria-hidden="true" />
                <p className="mt-4 text-sm font-medium text-mist-300">Nothing to clear yet.</p>
                <p className="mt-1 text-sm text-mist-500">Choose a workspace above to inspect disposable artifacts.</p>
              </div>
            </div>
          ) : (
            <div className="min-h-0 overflow-hidden">
              <div className="grid gap-3">
              {targets.map((target) => (
                <article className="group grid gap-5 rounded-2xl border border-white/8 bg-forest-900/55 p-5 transition-colors hover:border-sage-400/25 sm:grid-cols-[1fr_auto] sm:items-center" key={target.id}>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="text-xs font-medium uppercase tracking-[0.14em] text-sage-400">{target.category}</span>
                      <span className="text-xs text-mist-500">{target.name}</span>
                    </div>
                    <p className="mt-3 break-all font-mono text-xs leading-5 text-mist-500">{target.path}</p>
                  </div>
                  <div className="flex items-center justify-between gap-5 sm:justify-end">
                    <div className="text-right">
                      {target.sizePending ? (
                        <span className="inline-flex items-center gap-2 text-sm text-mist-500"><LoaderCircle size={16} className="animate-spin text-sage-400" aria-hidden="true" /> Loading size</span>
                      ) : target.sizeHasErrors ? (
                        <button type="button" onClick={() => refreshTargetSize(target.id)} className="inline-flex items-center gap-2 text-sm text-amber-300 hover:text-amber-200" aria-label={`Retry size for ${target.name}`}><RefreshCw size={15} aria-hidden="true" /> Refresh</button>
                      ) : (
                        <strong className="block text-lg font-semibold text-mist-100">{target.formattedSize}</strong>
                      )}
                    </div>
                    {!target.sizePending && !target.sizeHasErrors && <button type="button" disabled={cleaningTargetIds.has(target.id)} onClick={() => moveToTrash(target.id)} className="inline-flex size-10 items-center justify-center rounded-xl border border-white/10 text-mist-300 hover:border-sage-400/50 hover:bg-sage-400/10 hover:text-sage-300 disabled:cursor-wait disabled:opacity-50" aria-label={`Move ${target.name} to trash`}>
                      <Trash2 size={16} aria-hidden="true" />
                    </button>}
                  </div>
                </article>
              ))}
              </div>
            </div>
          )}
        </section>

        <footer className="flex shrink-0 items-center justify-between border-t border-white/8 py-5 text-xs text-mist-500">
          <span>Local by design.</span>
          <span className="inline-flex items-center gap-1.5"><X size={12} aria-hidden="true" /> No guessing</span>
        </footer>
      </div>
    </main>
  );
}

export default App;
