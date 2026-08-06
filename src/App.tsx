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
  formattedSize: string;
  lastModified: string | null;
};

type ScanStartResult = { scanId: string };
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

function App() {
  const [rootPath, setRootPath] = useState("");
  const [targets, setTargets] = useState<ScanTarget[]>([]);
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [status, setStatus] = useState("Ready to scan");
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const activeScanId = useRef<string | null>(null);

  useEffect(() => {
    const listeners = Promise.all([
      listen<TargetFound>("scan:target_found", ({ payload }) => {
        if (activeScanId.current && payload.scanId !== activeScanId.current) return;
        setTargets((current) =>
          current.some((target) => target.id === payload.target.id)
            ? current
            : [...current, payload.target],
        );
      }),
      listen<ScanProgress>("scan:progress", ({ payload }) => {
        if (activeScanId.current && payload.scanId !== activeScanId.current) return;
        setProgress(payload);
      }),
      listen<ScanFinished>("scan:finished", ({ payload }) => {
        if (activeScanId.current && payload.scanId !== activeScanId.current) return;
        setScanning(false);
        setStatus(`Scan complete in ${payload.durationMs} ms`);
      }),
      listen<{ scanId: string; message: string }>("scan:failed", ({ payload }) => {
        if (activeScanId.current && payload.scanId !== activeScanId.current) return;
        setScanning(false);
        setError(payload.message);
      }),
    ]);

    return () => {
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

    try {
      const result = await invoke<ScanStartResult>("start_scan", {
        path: rootPath.trim(),
      });
      activeScanId.current = result.scanId;
    } catch (scanError) {
      setScanning(false);
      setError(String(scanError));
    }
  }

  async function moveToTrash(targetId: string) {
    setError(null);
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
          <button type="submit" disabled={scanning || !rootPath.trim()}>
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
                  <strong>{target.formattedSize}</strong>
                  <button type="button" onClick={() => moveToTrash(target.id)}>
                    Move to trash
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
