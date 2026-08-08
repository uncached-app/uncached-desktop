import type { CleanupCapabilities } from "../types/scan";

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

// Desktop commands intentionally return raw results. Only events and capability
// responses use ApiEnvelope, matching the Rust command signatures.
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

export function unwrapV1<T>(envelope: unknown): T {
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
  return envelope.data as T;
}

function isPlatform(value: unknown): value is Platform {
  return value === "windows" || value === "linux" || value === "macos" || value === "android" || value === "unsupported";
}

function targetName(path: string): string {
  return path.replace(/[\\/]$/, "").split(/[\\/]/).pop() || "unknown";
}

export function normalizeTargetFound(payload: RawTargetFound) {
  if (!isRecord(payload) || typeof payload.scanId !== "string" || !isRecord(payload.target)) {
    throw new Error("Invalid target found payload");
  }
  const target = payload.target;
  if (typeof target.id !== "string" || target.id.length === 0 || typeof target.path !== "string") {
    throw new Error("Invalid target identity payload");
  }
  if (
    typeof target.category !== "string" ||
    typeof target.sizeBytes !== "number" ||
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
  if (!isRecord(payload) || typeof payload.scanId !== "string" || typeof payload.targetId !== "string" || payload.targetId.length === 0) {
    throw new Error("Invalid target sized payload");
  }
  if (
    typeof payload.sizeBytes !== "number" ||
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

export function toUiError(error: CoreErrorInfo): UiError {
  return { code: error.code, message: error.message };
}

export function canUseCleanupMode(capabilities: CleanupCapabilities | null, mode: "Trash" | "Permanent") {
  return capabilities !== null && (mode === "Permanent" ? capabilities.permanent : capabilities.trash);
}
