import { type FormEvent, useEffect, useRef, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import type {
  CleanResult,
  PendingScanEvent,
  ScanCancelled,
  ScanFinished,
  ScanProgress,
  ScanStarted,
  ScanStartResult,
  ScanTarget,
  Step,
  TargetFound,
  TargetSized,
} from "../types/scan";

export function useScanWorkspace() {
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
  const [step, setStep] = useState<Step>(1);
  const [cleanupSummary, setCleanupSummary] = useState({ removed: 0, freedBytes: 0 });
  const [scanFinished, setScanFinished] = useState(false);
  const [scanTargetCount, setScanTargetCount] = useState<number | null>(null);

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
      setScanFinished(true);
      setScanTargetCount(event.payload.totalTargets);
    } else if (event.kind === "cancelled") {
      pendingScan.current = false;
      pendingEvents.current = [];
      activeScanId.current = null;
      setScanning(false);
      setCancelling(false);
      setTargets([]);
      setProgress(null);
      setStatus("Scan cancelled");
      setStep(1);
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

  useEffect(() => {
    if (
      scanFinished &&
      scanTargetCount !== null &&
      targets.length >= scanTargetCount &&
      targets.every((target) => !target.sizePending)
    ) {
      setStep(3);
    }
  }, [scanFinished, scanTargetCount, targets]);

  async function startScan(event: FormEvent) {
    event.preventDefault();
    if (!rootPath.trim() || scanning) return;

    setError(null);
    setTargets([]);
    setCleanupSummary({ removed: 0, freedBytes: 0 });
    setScanFinished(false);
    setScanTargetCount(null);
    pendingSizeUpdates.current.clear();
    setProgress(null);
    setScanning(true);
    setStep(2);
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
      setStep(1);
      setScanFinished(false);
      setScanTargetCount(null);
      } else {
        setCancelling(false);
        setStatus("Scan already complete");
      }
    } catch (cancelError) {
      setCancelling(false);
      setError(String(cancelError));
    }
  }

  async function moveToTrash(targetId: string): Promise<CleanResult | null> {
    if (cleaningTargetIds.has(targetId)) return null;
    setError(null);
    setCleaningTargetIds((current) => new Set(current).add(targetId));
    try {
      const result = await invoke<CleanResult>("clean_target", {
        request: {
          targetId,
          mode: "Trash",
          confirmation: null,
        },
      });
      setTargets((current) => current.filter((target) => target.id !== targetId));
      setCleanupSummary((current) => ({
        removed: current.removed + 1,
        freedBytes: current.freedBytes + result.freedBytes,
      }));
      if (targets.length === 1) setStep(4);
      return result;
    } catch (cleanError) {
      setError(String(cleanError));
      return null;
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
    setTargets((current) =>
      current.map((target) =>
        target.id === targetId ? { ...target, sizePending: true, sizeHasErrors: false } : target,
      ),
    );
    try {
      await invoke("retry_target_size", { targetId });
    } catch (sizeError) {
      setTargets((current) =>
        current.map((target) =>
          target.id === targetId ? { ...target, sizePending: false, sizeHasErrors: true } : target,
        ),
      );
      setError(String(sizeError));
    }
  }

  async function deleteAll() {
    if (scanning || deletingAll || targets.some((target) => target.sizePending || target.sizeHasErrors)) return;
    setDeletingAll(true);
    try {
      const results = [];
      for (const target of targets) results.push(await moveToTrash(target.id));
      if (results.every(Boolean)) setStep(4);
    } finally {
      setDeletingAll(false);
    }
  }

  function resetScan() {
    setTargets([]);
        setStep(1);
        setScanFinished(false);
        setScanTargetCount(null);
    setStatus("Ready to scan");
  }

  const sizesReady = targets.length > 0 && targets.every((target) => !target.sizePending && !target.sizeHasErrors);
  const deleteAllDisabled = scanning || deletingAll || !sizesReady;
  const deleteAllLoading = scanning || deletingAll || targets.some((target) => target.sizePending);

  return {
    rootPath,
    setRootPath,
    targets,
    progress,
    status,
    error,
    scanning,
    cancelling,
    listenersReady,
    cleaningTargetIds,
    deletingAll,
    step,
    setStep,
    cleanupSummary,
    deleteAllDisabled,
    deleteAllLoading,
    startScan,
    pickFolder,
    cancelScan,
    moveToTrash,
    refreshTargetSize,
    deleteAll,
    resetScan,
  };
}
