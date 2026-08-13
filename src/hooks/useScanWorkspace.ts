import { type FormEvent, useEffect, useRef, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import type {
  CleanResult,
  CleanupCapabilities,
  PendingScanEvent,
  ScanCancelled,
  ScanFinished,
  ScanProgress,
  ScanStarted,
  ScanStartResult,
  ScanTarget,
  Step,
  TargetSized,
} from "../types/scan";
import type { CleanMode } from "../types/settings";
import {
  ApiContractError,
  type ApiEnvelope,
  canUseCleanupMode,
  normalizeTargetFound,
  normalizeTargetSized,
  isCurrentScanGeneration,
  isCurrentScanRequest,
  type RawTargetFound,
  type RawTargetSized,
  type RawCommandResult,
  toUiError,
  unwrapV1,
  validateCancelResult,
  validateCapabilities,
  validateCleanResult,
  validateRetryTargetSizeResult,
  validateScanCancelled,
  validateScanFinished,
  validateScanFailed,
  validateScanProgress,
  validateScanStartResult,
  validateScanStarted,
  shouldIgnoreScanFailure,
} from "../utils/apiContract";
import { getCleanupReadyTargets, shouldOpenReview } from "../utils/scanReview.mjs";

export function useScanWorkspace(cleanMode: CleanMode = "Trash") {
  const [rootPath, setRootPath] = useState("");
  const [extraRoots, setExtraRoots] = useState<string[]>([]);
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
  const [cleanupMode, setCleanupMode] = useState<CleanMode>("Trash");
  const [scanFinished, setScanFinished] = useState(false);
  const [scanTargetCount, setScanTargetCount] = useState<number | null>(null);
  const [capabilities, setCapabilities] = useState<CleanupCapabilities | null>(null);

  const activeScanId = useRef<string | null>(null);
  const scanGeneration = useRef(0);
  const pendingScan = useRef(false);
  const pendingEvents = useRef<PendingScanEvent[]>([]);
  const pendingSizeUpdates = useRef<Map<string, TargetSized>>(new Map());

  function acceptsScanEvent(scanId: string) {
    return activeScanId.current === scanId;
  }

  function failScan(message: string) {
    scanGeneration.current += 1;
    activeScanId.current = null;
    pendingScan.current = false;
    pendingEvents.current = [];
    pendingSizeUpdates.current.clear();
    setScanning(false);
    setCancelling(false);
    setTargets([]);
    setProgress(null);
    setScanFinished(false);
    setScanTargetCount(null);
    setStep(1);
    setStatus("Scan failed");
    setError(message);
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
      setStatus(`Scan complete · ${event.payload.totalTargets} targets · ${event.payload.durationMs} ms`);
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
      failScan(event.payload.error.message);
    }
  }

  function handleEnvelope<T>(
    kind: PendingScanEvent["kind"],
    envelope: ApiEnvelope<T>,
    normalize?: (payload: T) => PendingScanEvent["payload"],
  ) {
    try {
       const payload = unwrapV1<T>(envelope, normalize as ((value: unknown) => T) | undefined);
       handleScanEvent({ kind, payload } as PendingScanEvent);
    } catch (contractError) {
      const message = contractError instanceof ApiContractError
        ? toUiError(contractError.info).message
        : `IPC contract error: ${contractError instanceof Error ? contractError.message : String(contractError)}`;
      failScan(message);
    }
  }

  useEffect(() => {
    let disposed = false;

    if (!isTauri()) {
      setError("Tauri runtime unavailable. Start the app with `pnpm tauri dev`.");
      return;
    }

    const listeners = Promise.all([
      listen<ApiEnvelope<ScanStarted>>("scan:started", ({ payload }) => {
        try {
          const started = unwrapV1(payload, validateScanStarted);
          if (acceptsScanEvent(started.scanId)) setStatus("Scanning workspace...");
        } catch (contractError) {
          const message = contractError instanceof ApiContractError
            ? toUiError(contractError.info).message
            : `IPC contract error: ${contractError instanceof Error ? contractError.message : String(contractError)}`;
          failScan(message);
        }
      }),
      listen<ApiEnvelope<RawTargetFound>>("scan:target_found", ({ payload }) => {
        handleEnvelope("target", payload, normalizeTargetFound);
      }),
      listen<ApiEnvelope<RawTargetSized>>("scan:target_sized", ({ payload }) => {
        handleEnvelope("sized", payload, normalizeTargetSized);
      }),
      listen<ApiEnvelope<ScanProgress>>("scan:progress", ({ payload }) => {
        handleEnvelope("progress", payload, validateScanProgress);
      }),
      listen<ApiEnvelope<ScanFinished>>("scan:finished", ({ payload }) => {
        handleEnvelope("finished", payload, validateScanFinished);
      }),
      listen<ApiEnvelope<ScanCancelled>>("scan:cancelled", ({ payload }) => {
        handleEnvelope("cancelled", payload, validateScanCancelled);
      }),
      listen<ApiEnvelope<unknown>>("scan:failed", ({ payload }) => {
        const data = payload && typeof payload === "object" && "data" in payload
          ? (payload as { data?: unknown }).data
          : null;
        const scanId = data && typeof data === "object" && data !== null && "scanId" in data
          ? (data as { scanId?: unknown }).scanId
          : null;
        if (typeof scanId === "string" && shouldIgnoreScanFailure(scanId, activeScanId.current, pendingScan.current)) return;
        handleEnvelope("failed", payload, validateScanFailed);
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
    let disposed = false;
    if (!isTauri()) return;
    invoke<ApiEnvelope<CleanupCapabilities>>("cleanup_capabilities")
      .then((envelope) => {
        if (!disposed) setCapabilities(unwrapV1(envelope, validateCapabilities));
      })
      .catch((capabilityError) => {
        if (disposed) return;
        const message = capabilityError instanceof ApiContractError
          ? toUiError(capabilityError.info).message
          : "IPC contract error";
        setError(message);
      });
    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    if (shouldOpenReview(step, scanFinished, scanTargetCount, targets)) {
      setStep(3);
    }
  }, [scanFinished, scanTargetCount, step, targets]);

  /// Folds the given paths into the list. Rust owns the collapse, so the list
  /// shows exactly what a scan would read.
  async function addRoots(paths: string[]) {
    const next = [...extraRoots, ...paths.map((path) => path.trim()).filter(Boolean)];
    if (next.length === extraRoots.length) return;
    setExtraRoots(isTauri() ? await invoke<string[]>("normalize_workspace_roots", { paths: next }) : next);
  }

  function removeRoot(path: string) {
    setExtraRoots((current) => current.filter((root) => root !== path));
  }

  async function startScan(event: FormEvent) {
    event.preventDefault();
    // The field counts as a root, so one folder needs no list.
    const pending = rootPath.trim();
    const roots = pending && !extraRoots.includes(pending) ? [...extraRoots, pending] : extraRoots;
    if (roots.length === 0 || scanning) return;

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
    const generation = ++scanGeneration.current;
    activeScanId.current = null;
    pendingScan.current = true;
    pendingEvents.current = [];

    try {
      const rawResult = await invoke<RawCommandResult<ScanStartResult>>("start_scan", {
        paths: roots,
      });
      if (!isCurrentScanGeneration(generation, scanGeneration.current, pendingScan.current)) return;
      const result = validateScanStartResult(rawResult);
      activeScanId.current = result.scanId;
      pendingScan.current = false;
      const events = pendingEvents.current;
      pendingEvents.current = [];
      events.forEach(handleScanEvent);
    } catch (scanError) {
      if (isCurrentScanGeneration(generation, scanGeneration.current, pendingScan.current)) {
        failScan(String(scanError));
      }
    }
  }

  async function pickFolderPath(): Promise<string | null> {
    setError(null);
    if (!isTauri()) {
      setError("Tauri runtime unavailable. Start the app with `pnpm dev`.");
      return null;
    }

    try {
      const selected = await open({ directory: true, multiple: false });
      return typeof selected === "string" ? selected : null;
    } catch (pickerError) {
      setError(String(pickerError));
      return null;
    }
  }

  async function pickRoot() {
    const selected = await pickFolderPath();
    if (!selected) return;
    await addRoots([rootPath, selected]);
    setRootPath("");
  }

  async function commitDraft() {
    if (!rootPath.trim()) return;
    await addRoots([rootPath]);
    setRootPath("");
  }

  async function cancelScan() {
    const scanId = activeScanId.current;
    if (!scanId || !scanning || cancelling) return;
    const generation = scanGeneration.current;

    setCancelling(true);
    setError(null);
    setStatus("Cancelling scan...");
    try {
      const rawResult = await invoke<RawCommandResult<{ cancelled: boolean }>>("cancel_scan", { scanId });
      if (generation !== scanGeneration.current || activeScanId.current !== scanId) return;
      const result = validateCancelResult(rawResult);
      if (result.cancelled) {
        scanGeneration.current += 1;
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
      if (isCurrentScanRequest(generation, scanGeneration.current, scanId, activeScanId.current)) {
        setCancelling(false);
        setError(String(cancelError));
      }
    }
  }

  async function cleanTarget(targetId: string, confirmation: string | null = null): Promise<CleanResult | null> {
    if (!targetId) {
      setError("Cannot clean target without an ID");
      return null;
    }
    if (cleaningTargetIds.has(targetId)) return null;
    setError(null);
    setCleaningTargetIds((current) => new Set(current).add(targetId));
    try {
       const envelope = await invoke<ApiEnvelope<CleanResult>>("clean_target", {
        request: {
          targetId,
          mode: cleanMode,
          confirmation,
        },
      });
       const result = unwrapV1(envelope, validateCleanResult);
      setTargets((current) => current.filter((target) => target.id !== targetId));
      setCleanupSummary((current) => ({
        removed: current.removed + 1,
        freedBytes: current.freedBytes + result.freedBytes,
      }));
      setCleanupMode(result.modeUsed);
      if (targets.length === 1) setStep(4);
      return result;
    } catch (cleanError) {
      setError(cleanError instanceof ApiContractError ? toUiError(cleanError.info).message : "IPC contract error");
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
    if (!targetId) {
      setError("Cannot retry target size without an ID");
      return;
    }
    setError(null);
    setTargets((current) =>
      current.map((target) =>
        target.id === targetId ? { ...target, sizePending: true, sizeHasErrors: false } : target,
      ),
    );
    try {
      const result = await invoke<RawCommandResult<TargetSized>>("retry_target_size", { targetId });
      validateRetryTargetSizeResult(result);
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
      for (const target of targets) results.push(await cleanTarget(target.id));
      if (results.every(Boolean)) setStep(4);
    } finally {
      setDeletingAll(false);
    }
  }

  function resetScan() {
    scanGeneration.current += 1;
    activeScanId.current = null;
    pendingScan.current = false;
    pendingEvents.current = [];
    setTargets([]);
    setStep(1);
    setScanFinished(false);
    setScanTargetCount(null);
    setStatus("Ready to scan");
    setCleanupMode("Trash");
  }

  const sizesReady = targets.length > 0 && getCleanupReadyTargets(targets).length === targets.length;
  const deleteAllDisabled = scanning || deletingAll || !sizesReady;
  const deleteAllLoading = scanning || deletingAll || targets.some((target) => target.sizePending);
  const cleanupModeSupported = canUseCleanupMode(capabilities, cleanMode);

  return {
    rootPath,
    extraRoots,
    removeRoot,
    pickRoot,
    commitDraft,
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
    cleanupMode,
    deleteAllDisabled,
    deleteAllLoading,
    capabilities,
    cleanupModeSupported,
    startScan,
    cancelScan,
    cleanTarget,
    refreshTargetSize,
    deleteAll,
    resetScan,
  };
}
