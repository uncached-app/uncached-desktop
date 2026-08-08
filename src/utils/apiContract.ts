import type {
  CleanResult,
  CleanupCapabilities,
  ScanCancelled,
  ScanFinished,
  ScanProgress,
  ScanStarted,
  ScanStartResult,
  TargetSized,
} from "../types/scan";

export type Platform = "windows" | "linux" | "macos" | "android" | "unsupported";

export type CoreErrorInfo = {
  code: string;
  message: string;
  path?: string | null;
  operation?: string | null;
};

export type ApiEnvelope<T> = {
  apiVersion: "v1" | string;
  platform: Platform;
  data: T | null;
  error: CoreErrorInfo | null;
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
    category: string;
    sizeBytes: number;
    sizePending: boolean;
    sizeHasErrors: boolean;
    formattedSize: string;
    lastModified?: string | null;
  };
};

export type RawTargetSized = {
  scanId: string;
  targetId: string;
  sizeBytes: number;
  sizePending: boolean;
  sizeHasErrors: boolean;
  formattedSize: string;
};

export type UiError = {
  code: string;
  message: string;
};

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

function isCoreErrorInfo(value: unknown): value is CoreErrorInfo {
  return isRecord(value) && typeof value.code === "string" && typeof value.message === "string";
}

type PayloadValidator<T> = (value: unknown) => T;

export function unwrapV1<T>(envelope: unknown, validate?: PayloadValidator<T>): T {
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

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return isFiniteNonNegativeNumber(value) && Number.isInteger(value);
}

export function isCurrentScanGeneration(generation: number, currentGeneration: number, pending: boolean): boolean {
  return pending && generation === currentGeneration;
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
  return value as ScanFinished;
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

export function validateScanFailed(value: unknown): { scanId: string; message: string } {
  if (!isRecord(value) || !isNonEmptyString(value.scanId) || !isNonEmptyString(value.message)) {
    throw new Error("Invalid scan failed payload");
  }
  return value as { scanId: string; message: string };
}

export function validateCapabilities(value: unknown): CleanupCapabilities {
  if (
    !isRecord(value) ||
    typeof value.permanent !== "boolean" ||
    typeof value.trash !== "boolean" ||
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
  if (hasOwn(target, "lastModified") && target.lastModified !== null && typeof target.lastModified !== "string") {
    throw new Error("Invalid target payload shape");
  }
  return {
    scanId: payload.scanId,
    target: {
      ...target,
      name: target.name || targetName(target.path),
      formattedSize: target.sizePending ? "" : target.formattedSize,
      lastModified: target.lastModified ?? null,
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
  return {
    ...payload,
    formattedSize: payload.sizePending ? "" : payload.formattedSize,
  };
}

export function validateRetryTargetSizeResult(value: unknown): TargetSized {
  return normalizeTargetSized(value as RawTargetSized);
}

export function toUiError(error: CoreErrorInfo): UiError {
  return { code: error.code, message: error.message };
}

export function canUseCleanupMode(capabilities: CleanupCapabilities | null, mode: "Trash" | "Permanent") {
  return capabilities !== null && (mode === "Permanent" ? capabilities.permanent : capabilities.trash);
}
