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
  ScanNotice,
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
import { describeError } from "../i18n/errors";
import { shouldOpenReview } from "../utils/scanReview.mjs";
import { describeFailure } from "../i18n/errors";

export function useScanWorkspace(
  cleanMode: CleanMode = "Trash",
  indexRoots: (roots: string[]) => void = () => {},
  persistRoots: (roots: string[]) => void = () => {},
  proEnabled = false,
) {
  const [extraRoots, setExtraRoots] = useState<string[]>([]);
  const [targets, setTargets] = useState<ScanTarget[]>([]);
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [notice, setNotice] = useState<ScanNotice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [listenersReady, setListenersReady] = useState(false);
  const [cleaningTargetIds, setCleaningTargetIds] = useState<Set<string>>(new Set());
  const [step, setStep] = useState<Step>(1);
  const [cleanupSummary, setCleanupSummary] = useState({ removed: 0, freedBytes: 0 });
  const [cleanupMode, setCleanupMode] = useState<CleanMode>("Trash");
  const [scanFinished, setScanFinished] = useState(false);
  const [scanTargetCount, setScanTargetCount] = useState<number | null>(null);
  // Which folders the artifact list on hand describes, or null for none.
  //
  // The workspace no longer pays for that list to be opened: reading the
  // projects is milliseconds and walking every one of them for artifacts is the
  // long part, so the walk waits for somebody to ask for it. This is how
  // Reclaim knows whether it is being opened onto an answer or has to go and
  // get one.
  const [scannedRoots, setScannedRoots] = useState<string | null>(null);
  // Folders the walk was not allowed to open. Above zero, the target count and
  // the byte total are both short by whatever is inside them, and the review
  // screen has to say so rather than presenting either as the whole workspace.
  const [unreadable, setUnreadable] = useState(0);
  const [capabilities, setCapabilities] = useState<CleanupCapabilities | null>(null);

  const activeScanId = useRef<string | null>(null);
  const scanGeneration = useRef(0);
  /** The folders the in-flight walk was started for, for when it finishes. */
  const walkingRoots = useRef("");
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
    setScannedRoots(null);
    setUnreadable(0);
    setStep(1);
    setNotice(null);
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
              lastUsedAt: sizeUpdate.lastUsedAt ?? null,
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
                lastUsedAt: event.payload.lastUsedAt ?? null,
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
      setScanFinished(true);
      setScanTargetCount(event.payload.totalTargets);
      setScannedRoots(walkingRoots.current);
      setUnreadable(event.payload.unreadable);
    } else if (event.kind === "cancelled") {
      pendingScan.current = false;
      pendingEvents.current = [];
      activeScanId.current = null;
      setScanning(false);
      setCancelling(false);
      setTargets([]);
      setProgress(null);
      setScannedRoots(null);
      // What it had already found when it stopped. The backend sends real
      // counts now, and a scan cancelled after finding four gigabytes tells the
      // user that rather than reporting the stop as if nothing happened.
      setNotice({ kind: "cancelled", targetsFound: event.payload.totalTargets });
      setStep(1);
    } else {
      failScan(describeError(event.payload.error));
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
        ? describeError(contractError.info)
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
          if (acceptsScanEvent(started.scanId)) setNotice(null);
        } catch (contractError) {
          const message = contractError instanceof ApiContractError
            ? describeError(contractError.info)
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
          ? describeError(capabilityError.info)
          : "IPC contract error";
        setError(message);
      });
    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    if (shouldOpenReview(step, scanFinished, scanTargetCount, targets)) {
      // A refused Cancel belongs to the step that offered it.
      setNotice(null);
      setStep(3);
    }
  }, [scanFinished, scanTargetCount, step, targets]);

  /// Folds the given paths into the list. Rust owns the collapse, so the list
  /// shows exactly what a scan would read.
  async function addRoots(paths: string[]) {
    const next = [...extraRoots, ...paths.map((path) => path.trim()).filter(Boolean)];
    if (next.length === extraRoots.length) return;
    const collapsed = isTauri()
      ? await invoke<string[]>("normalize_workspace_roots", { paths: next })
      : next;
    setExtraRoots(collapsed);
    persistRoots(collapsed);
  }

  function removeRoot(path: string) {
    setExtraRoots((current) => {
      const next = current.filter((root) => root !== path);
      persistRoots(next);
      return next;
    });
  }

  /// Drops every folder. Nothing on disk moves; the workspace just has no
  /// folders left to read, which is the state the picker starts from.
  function clearRoots() {
    setExtraRoots([]);
    persistRoots([]);
  }

  /// Restores a saved selection without persisting it back.
  function restoreRoots(paths: string[]) {
    setExtraRoots(paths);
  }

  /// Opens the chosen folders as a workspace: the projects, and nothing else.
  ///
  /// This is what the picker submits now. Discovery is milliseconds and the
  /// weights fill in behind it, so the map is on screen almost at once — where
  /// it used to sit behind a full artifact walk of every project plus a pass
  /// over the home directory, which is most of a minute on a real disk and none
  /// of it needed to answer "what have I got".
  function openWorkspace(event?: FormEvent) {
    event?.preventDefault();
    if (extraRoots.length === 0) return;
    setError(null);
    setNotice(null);
    void indexRoots(extraRoots);
    setStep(3);
  }

  /// The reclaim scan, and a change to the chosen folders while its list is
  /// open — which has no event to cancel.
  async function startScan(event?: FormEvent) {
    event?.preventDefault();
    const roots = extraRoots;
    if (roots.length === 0 || scanning) return;
    // One action, two readings of the same folders: the artifacts inside them
    // and the projects that own those artifacts.
    void indexRoots(roots);

    setError(null);
    setTargets([]);
    setCleanupSummary({ removed: 0, freedBytes: 0 });
    setScanFinished(false);
    setScanTargetCount(null);
    setScannedRoots(null);
    walkingRoots.current = roots.join("\n");
    setUnreadable(0);
    pendingSizeUpdates.current.clear();
    setProgress(null);
    setScanning(true);
    setStep(2);
    setNotice(null);
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
        failScan(describeFailure(scanError));
      }
    }
  }

  /// Multi-select follows the plan, so the dialog never accepts folders the
  /// scan would then drop.
  async function pickFolderPaths(): Promise<string[]> {
    setError(null);
    if (!isTauri()) {
      setError("Tauri runtime unavailable. Start the app with `pnpm dev`.");
      return [];
    }

    try {
      const selected = await open({ directory: true, multiple: proEnabled });
      if (Array.isArray(selected)) return selected;
      return typeof selected === "string" ? [selected] : [];
    } catch (pickerError) {
      setError(String(pickerError));
      return [];
    }
  }

  async function pickRoot() {
    const selected = await pickFolderPaths();
    if (selected.length > 0) await addRoots(selected);
  }

  async function cancelScan() {
    const scanId = activeScanId.current;
    if (!scanId || !scanning || cancelling) return;
    const generation = scanGeneration.current;

    setCancelling(true);
    setError(null);

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
        // The backend also emits `scan:cancelled`, with the count. Whichever
        // arrives first wins, and this one has no count to report — so it fills
        // in only when the event did not.
        setNotice((current) => (current?.kind === "cancelled" ? current : { kind: "cancelled", targetsFound: null }));
      setStep(1);
      setScanFinished(false);
      setScanTargetCount(null);
      setScannedRoots(null);
      setUnreadable(0);
      } else {
        setCancelling(false);
        setNotice({ kind: "cancelRefused" });
      }
    } catch (cancelError) {
      if (isCurrentScanRequest(generation, scanGeneration.current, scanId, activeScanId.current)) {
        setCancelling(false);
        setError(describeFailure(cancelError));
      }
    }
  }

  /**
   * `mode` overrides the user's default for callers whose removal mode is not
   * theirs to choose. Maintenance is the one that exists: a policy always moves
   * to the Recycle Bin, so a machine whose default is Permanent must not have
   * that default applied to a selection the user reviewed as reversible.
   */
  async function cleanTarget(
    targetId: string,
    confirmation: string | null = null,
    mode: CleanMode = cleanMode,
  ): Promise<CleanResult | null> {
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
          mode,
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
      setError(cleanError instanceof ApiContractError ? describeError(cleanError.info) : "IPC contract error");
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
      setError(describeFailure(sizeError));
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
    setScannedRoots(null);
    setUnreadable(0);
    setNotice(null);
    setCleanupMode("Trash");
  }

  const cleanupModeSupported = canUseCleanupMode(capabilities, cleanMode);
  /// Whether the artifact list on hand is about the folders currently chosen.
  const scanTaken = scannedRoots !== null && scannedRoots === extraRoots.join("\n");

  return {
    extraRoots,
    removeRoot,
    clearRoots,
    restoreRoots,
    pickRoot,
    targets,
    progress,
    notice,
    error,
    scanning,
    cancelling,
    listenersReady,
    cleaningTargetIds,
    step,
    setStep,
    cleanupSummary,
    cleanupMode,
    capabilities,
    cleanupModeSupported,
    scanTaken,
    openWorkspace,
    startScan,
    cancelScan,
    cleanTarget,
    refreshTargetSize,
    resetScan,
    unreadable,
  };
}
