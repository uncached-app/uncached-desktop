import { type FormEvent, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import "./App.css";

type Category = string;

type ScanTarget = {
  id: string;
  path: string;
  name: string;
  category: Category;
  sizeBytes: number;
  sizeHasErrors: boolean;
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
type ScanFinished = {
  scanId: string;
  totalTargets: number;
  totalBytesFound: number;
  durationMs: number;
};
type PendingScanEvent =
  | { kind: "target"; payload: TargetFound }
  | { kind: "progress"; payload: ScanProgress }
  | { kind: "finished"; payload: ScanFinished }
  | { kind: "failed"; payload: { scanId: string; message: string } };

function App() {
  const [rootPath, setRootPath] = useState("");
  const [targets, setTargets] = useState<ScanTarget[]>([]);
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [status, setStatus] = useState("Ready to scan");
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [listenersReady, setListenersReady] = useState(false);
  const [cleaningTargetIds, setCleaningTargetIds] = useState<Set<string>>(new Set());
  const activeScanId = useRef<string | null>(null);
  const pendingScan = useRef(false);
  const pendingEvents = useRef<PendingScanEvent[]>([]);

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
      setTargets((current) =>
        current.some((target) => target.id === event.payload.target.id)
          ? current
          : [...current, event.payload.target],
      );
    } else if (event.kind === "progress") {
      setProgress(event.payload);
    } else if (event.kind === "finished") {
      pendingScan.current = false;
      setScanning(false);
      setStatus(`Scan complete in ${event.payload.durationMs} ms`);
    } else {
      pendingScan.current = false;
      setScanning(false);
      setStatus("Scan failed");
      setError(event.payload.message);
    }
  }

  useEffect(() => {
    let disposed = false;
    const listeners = Promise.all([
      listen<ScanStarted>("scan:started", ({ payload }) => {
        if (acceptsScanEvent(payload.scanId)) setStatus("Scanning workspace...");
      }),
      listen<TargetFound>("scan:target_found", ({ payload }) => {
        handleScanEvent({ kind: "target", payload });
      }),
      listen<ScanProgress>("scan:progress", ({ payload }) => {
        handleScanEvent({ kind: "progress", payload });
      }),
      listen<ScanFinished>("scan:finished", ({ payload }) => {
        handleScanEvent({ kind: "finished", payload });
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

  return (
    <main className="app-shell">
      <header className="hero">
        <p className="eyebrow">NUKE MODULES / WORKSPACE CLEANER</p>
        <h1>Recover space without guessing.</h1>
        <p className="lede">
          Scan project trees for disposable build artifacts. Every cleanup is
          authorized by the Rust backend.
        </p>
      </header>

      <form className="scan-form" onSubmit={startScan}>
        <label htmlFor="root-path">Workspace root</label>
        <div className="form-row">
          <input
            id="root-path"
            value={rootPath}
            onChange={(event) => setRootPath(event.currentTarget.value)}
            placeholder="C:\\Users\\you\\Projects"
            spellCheck={false}
          />
          <button type="submit" disabled={!listenersReady || scanning || !rootPath.trim()}>
            {scanning ? "Scanning" : "Scan workspace"}
          </button>
        </div>
      </form>

      <section className="status-bar" aria-live="polite">
        <span className={scanning ? "pulse status-dot" : "status-dot"} />
        <span>{status}</span>
        {progress && (
          <span className="status-detail">
            {progress.directoriesScanned.toLocaleString()} directories / {progress.targetsFound} targets
          </span>
        )}
      </section>

      {error && <p className="error-message">{error}</p>}

      <section className="results" aria-label="Scan targets">
        <div className="section-heading">
          <div>
            <p className="eyebrow">FINDINGS</p>
            <h2>Disposable artifacts</h2>
          </div>
          <span className="count-badge">{targets.length}</span>
        </div>

        {targets.length === 0 ? (
          <div className="empty-state">
            <strong>No targets found yet.</strong>
            <span>Start a scan to inspect project caches and build output.</span>
          </div>
        ) : (
          <div className="target-list">
            {targets.map((target) => (
              <article className="target-card" key={target.id}>
                <div>
                  <p className="target-category">{target.category}</p>
                  <h3>{target.name}</h3>
                  <p className="target-path">{target.path}</p>
                </div>
                <div className="target-action">
                  <strong>
                    {target.formattedSize}
                    {target.sizeHasErrors && (
                      <small className="size-warning">Size may be incomplete</small>
                    )}
                  </strong>
                  <button
                    type="button"
                    disabled={cleaningTargetIds.has(target.id)}
                    onClick={() => moveToTrash(target.id)}
                  >
                    {cleaningTargetIds.has(target.id) ? "Moving..." : "Move to trash"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

export default App;
