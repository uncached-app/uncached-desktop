import type {
  CleanResult,
  CleanupCapabilities,
  Confidence,
  ConfidenceLevel,
  Plan,
  ScanCancelled,
  ScanFinished,
  ScanFailed,
  ScanProgress,
  ScanStarted,
  ScanStartResult,
  TargetSized,
} from "../types/scan";

export type Platform = "windows" | "linux" | "macos" | "android" | "unsupported";

export const CORE_ERROR_CODES = [
  "invalid_workspace",
  "io",
  "provider_unavailable",
  "target_missing",
  "target_not_directory",
  "target_name_unsupported",
  "target_provider_mismatch",
  "target_context_invalid",
  "target_outside_workspace",
  "target_identity_unavailable",
  "target_identity_changed",
  "target_reparse_point",
  "secure_operation_unsupported",
  "secure_target_open_failed",
  "secure_target_too_large",
  "secure_target_too_deep",
  "secure_enumeration_failed",
  "secure_handle_query_failed",
  "secure_deletion_failed",
  "secure_trash_unavailable",
  "secure_trash_initialization_failed",
  "secure_trash_operation_failed",
  "secure_trash_aborted",
  "secure_trash_postcondition_failed",
  "target_in_use",
] as const;

export type CoreErrorCode = (typeof CORE_ERROR_CODES)[number];

export type CoreErrorInfo = {
  code: CoreErrorCode;
  message: string;
  path: string | null;
  operation: string | null;
};

export type ApiEnvelope<T> = {
  apiVersion: "v1";
  platform: Platform;
  data: T | null;
  error: CoreErrorInfo | null;
};

export type RawApiEnvelope = {
  apiVersion: unknown;
  platform: unknown;
  data: unknown;
  error: unknown;
};

// Desktop commands intentionally return raw results. Their call sites must run
// the matching validator before using any field, matching Rust command signatures.
export type RawCommandResult<T> = T;

export type RawTargetFound = {
  scanId: string;
  target: {
    id: string;
    path: string;
    name?: string;
    // The tool's own name for a discovered cache, where the directory's
    // basename identifies nothing. Null for anything found in a workspace.
    label?: string | null;
    category: string;
    plan: Plan;
    confidence: Confidence;
    cleanable: boolean;
    reclaimWith?: string | null;
    sizeBytes: number;
    lastUsedAt?: number | null;
    sizePending: boolean;
    sizeHasErrors: boolean;
    formattedSize: string;
  };
};

export type RawTargetSized = {
  scanId: string;
  targetId: string;
  sizeBytes: number;
  lastUsedAt?: number | null;
  sizePending: boolean;
  sizeHasErrors: boolean;
  formattedSize: string;
};

export type RawScanFailed = ScanFailed;

export class ApiContractError extends Error {
  readonly info: CoreErrorInfo;

  constructor(info: CoreErrorInfo) {
    super(info.message);
    this.name = "ApiContractError";
    this.info = info;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

// Single source of truth: the guard reads the same list the type is built from,
// so a new Core code cannot be accepted by the type and rejected at runtime.
function isCoreErrorCode(value: unknown): value is CoreErrorCode {
  return typeof value === "string" &&
    (CORE_ERROR_CODES as readonly string[]).includes(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isCoreErrorInfo(value: unknown): value is CoreErrorInfo {
  return isRecord(value) &&
    Object.keys(value).sort().join(",") === "code,message,operation,path" &&
    hasOwn(value, "code") && isCoreErrorCode(value.code) &&
    hasOwn(value, "message") && typeof value.message === "string" &&
    hasOwn(value, "path") && isNullableString(value.path) &&
    hasOwn(value, "operation") && isNullableString(value.operation);
}

type PayloadValidator<T> = (value: unknown) => T;

export function unwrapV1<T>(envelope: RawApiEnvelope, validate?: PayloadValidator<T>): T {
  if (!isRecord(envelope) || !hasOwn(envelope, "apiVersion")) {
    throw new Error("API envelope is missing apiVersion");
  }
  if (envelope.apiVersion !== "v1") {
    throw new Error(`Unsupported API version: ${String(envelope.apiVersion)}`);
  }
  if (!hasOwn(envelope, "platform") || !isPlatform(envelope.platform)) {
    throw new Error("API envelope has invalid platform");
  }
  const keys = Object.keys(envelope).sort();
  if (keys.join(",") !== "apiVersion,data,error,platform") {
    throw new Error("API envelope has invalid shape");
  }
  if (!hasOwn(envelope, "data") || !hasOwn(envelope, "error")) {
    throw new Error("API envelope is missing data or error");
  }
  if (envelope.data === undefined || envelope.error === undefined) {
    throw new Error("API envelope must contain exactly one of data or error");
  }

  const hasData = envelope.data !== null && envelope.data !== undefined;
  const hasError = envelope.error !== null && envelope.error !== undefined;
  if (hasData === hasError) {
    throw new Error("API envelope must contain exactly one of data or error");
  }
  if (hasError) {
    if (!isRecord(envelope.error)) throw new Error("API envelope contains invalid error shape");
    if (!isCoreErrorCode(envelope.error.code)) throw new Error("API envelope contains unknown error code");
    if (!isCoreErrorInfo(envelope.error)) throw new Error("API envelope contains invalid error shape");
    throw new ApiContractError(envelope.error);
  }
  if (hasData && !isRecord(envelope.data)) {
    throw new Error("API envelope contains invalid payload shape");
  }
  return validate ? validate(envelope.data) : envelope.data as T;
}

function isPlatform(value: unknown): value is Platform {
  return value === "windows" || value === "linux" || value === "macos" || value === "android" || value === "unsupported";
}

function targetName(path: string): string {
  return path.replace(/[\\/]$/, "").split(/[\\/]/).pop() || "unknown";
}

function isFiniteNonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

/** Seconds since the epoch, or nothing measured yet. Never a future guess. */
function isEpochSecondsOrNull(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

const CONFIDENCE_LEVELS: readonly ConfidenceLevel[] = ["high", "medium", "review"];

// The level and its reasons are decided in Rust. The UI renders them and never
// derives one from the other.
function isConfidence(value: unknown): value is Confidence {
  return (
    isRecord(value) &&
    (CONFIDENCE_LEVELS as readonly string[]).includes(value.level as string) &&
    Array.isArray(value.signals) &&
    value.signals.every((signal) => isNonEmptyString(signal))
  );
}

function isNonNegativeInteger(value: unknown): value is number {
  return isFiniteNonNegativeNumber(value) && Number.isInteger(value);
}

export function isCurrentScanGeneration(generation: number, currentGeneration: number, pending: boolean): boolean {
  return pending && generation === currentGeneration;
}

export function isCurrentScanRequest(
  generation: number,
  currentGeneration: number,
  scanId: string,
  activeScanId: string | null,
): boolean {
  return generation === currentGeneration && activeScanId === scanId;
}

export function shouldIgnoreScanFailure(
  scanId: string,
  activeScanId: string | null,
  pendingScan: boolean,
): boolean {
  return activeScanId === null ? !pendingScan : activeScanId !== scanId;
}

export function validateScanStarted(value: unknown): ScanStarted {
  if (!isRecord(value) || !isNonEmptyString(value.scanId) || !isNonEmptyString(value.rootPath)) {
    throw new Error("Invalid scan started payload");
  }
  return value as ScanStarted;
}

export function validateScanProgress(value: unknown): ScanProgress {
  if (
    !isRecord(value) ||
    !isNonEmptyString(value.scanId) ||
    !isNonNegativeInteger(value.directoriesScanned) ||
    !isNonNegativeInteger(value.targetsFound) ||
    !isFiniteNonNegativeNumber(value.totalBytesFound)
  ) {
    throw new Error("Invalid scan progress payload");
  }
  return value as ScanProgress;
}

export function validateScanFinished(value: unknown): ScanFinished {
  if (
    !isRecord(value) ||
    !isNonEmptyString(value.scanId) ||
    !isNonNegativeInteger(value.totalTargets) ||
    !isFiniteNonNegativeNumber(value.totalBytesFound) ||
    !isFiniteNonNegativeNumber(value.durationMs)
  ) {
    throw new Error("Invalid scan finished payload");
  }
  // Defaulted rather than required: the core defaults it too, so a desktop
  // running against a core that predates the field gets a scan rather than a
  // thrown event.
  return {
    ...(value as ScanFinished),
    unreadable: isNonNegativeInteger(value.unreadable) ? value.unreadable : 0,
  };
}

export function validateScanFailed(value: unknown): ScanFailed {
  if (!isRecord(value) || !isNonEmptyString(value.scanId) || !isRecord(value.error)) {
    throw new Error("Invalid scan failed payload");
  }
  if (!isCoreErrorCode(value.error.code)) throw new Error("unknown error code in scan failed payload");
  if (!isCoreErrorInfo(value.error)) throw new Error("Invalid scan failed error shape");
  return value as ScanFailed;
}

export function validateScanCancelled(value: unknown): ScanCancelled {
  if (
    !isRecord(value) ||
    !isNonEmptyString(value.scanId) ||
    !isNonNegativeInteger(value.totalTargets) ||
    !isFiniteNonNegativeNumber(value.totalBytesFound)
  ) {
    throw new Error("Invalid scan cancelled payload");
  }
  return value as ScanCancelled;
}

export function validateCapabilities(value: unknown): CleanupCapabilities {
  if (
    !isRecord(value) ||
    typeof value.permanentCleanup !== "boolean" ||
    typeof value.moveToTrash !== "boolean" ||
    typeof value.secureIdentity !== "boolean"
  ) {
    throw new Error("Invalid capabilities payload");
  }
  return value as CleanupCapabilities;
}

export function validateScanStartResult(value: unknown): ScanStartResult {
  if (!isRecord(value) || !isNonEmptyString(value.scanId)) throw new Error("Invalid start scan result");
  return value as ScanStartResult;
}

export function validateCancelResult(value: unknown): { cancelled: boolean } {
  if (!isRecord(value) || typeof value.cancelled !== "boolean") throw new Error("Invalid cancel scan result");
  return value as { cancelled: boolean };
}

export function validateCleanResult(value: unknown): CleanResult {
  if (
    !isRecord(value) ||
    !isFiniteNonNegativeNumber(value.freedBytes) ||
    typeof value.sizeHasErrors !== "boolean" ||
    (value.modeUsed !== "Trash" && value.modeUsed !== "Permanent")
  ) {
    throw new Error("Invalid clean result");
  }
  return value as CleanResult;
}

export function normalizeTargetFound(payload: RawTargetFound) {
  if (!isRecord(payload) || !isNonEmptyString(payload.scanId) || !isRecord(payload.target)) {
    throw new Error("Invalid target found payload");
  }
  const target = payload.target;
  if (!isNonEmptyString(target.id) || !isNonEmptyString(target.path)) {
    throw new Error("Invalid target identity payload");
  }
  if (
    !isNonEmptyString(target.category) ||
    // The plan is decided in Rust; the UI reads it and never recomputes it.
    (target.plan !== "free" && target.plan !== "pro") ||
    !isConfidence(target.confidence) ||
    // Absent means cleanable: a native layer that predates the field only ever
    // produced targets a provider had already vouched for.
    (hasOwn(target, "cleanable") && typeof target.cleanable !== "boolean") ||
    !isFiniteNonNegativeNumber(target.sizeBytes) ||
    typeof target.sizePending !== "boolean" ||
    typeof target.sizeHasErrors !== "boolean" ||
    typeof target.formattedSize !== "string"
  ) {
    throw new Error("Invalid target payload shape");
  }
  if (hasOwn(target, "name") && (typeof target.name !== "string" || target.name.length === 0)) {
    throw new Error("Invalid target payload shape");
  }
  if (
    hasOwn(target, "label") &&
    target.label !== null &&
    (typeof target.label !== "string" || target.label.length === 0)
  ) {
    throw new Error("Invalid target payload shape");
  }
  if (hasOwn(target, "lastUsedAt") && !isEpochSecondsOrNull(target.lastUsedAt)) {
    throw new Error("Invalid target payload shape");
  }
  if (
    hasOwn(target, "reclaimWith") &&
    target.reclaimWith !== null &&
    (typeof target.reclaimWith !== "string" || target.reclaimWith.length === 0)
  ) {
    throw new Error("Invalid target payload shape");
  }
  return {
    scanId: payload.scanId,
    target: {
      ...target,
      name: target.name || targetName(target.path),
      label: target.label ?? null,
      cleanable: target.cleanable ?? true,
      reclaimWith: target.reclaimWith ?? null,
      lastUsedAt: target.lastUsedAt ?? null,
      formattedSize: target.sizePending ? "" : target.formattedSize,
    },
  };
}

export function normalizeTargetSized(payload: RawTargetSized): RawTargetSized {
  if (!isRecord(payload) || !isNonEmptyString(payload.scanId) || !isNonEmptyString(payload.targetId)) {
    throw new Error("Invalid target sized payload");
  }
  if (
    !isFiniteNonNegativeNumber(payload.sizeBytes) ||
    typeof payload.sizePending !== "boolean" ||
    typeof payload.sizeHasErrors !== "boolean" ||
    typeof payload.formattedSize !== "string"
  ) {
    throw new Error("Invalid target sized payload shape");
  }
  if (hasOwn(payload, "lastUsedAt") && !isEpochSecondsOrNull(payload.lastUsedAt)) {
    throw new Error("Invalid target sized payload shape");
  }
  return {
    ...payload,
    lastUsedAt: payload.lastUsedAt ?? null,
    formattedSize: payload.sizePending ? "" : payload.formattedSize,
  };
}

export function validateRetryTargetSizeResult(value: unknown): TargetSized {
  return normalizeTargetSized(value as RawTargetSized);
}

export function canUseCleanupMode(capabilities: CleanupCapabilities | null, mode: "Trash" | "Permanent") {
  return capabilities !== null && (mode === "Permanent" ? capabilities.permanentCleanup : capabilities.moveToTrash);
}
