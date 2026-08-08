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

function isCoreErrorInfo(value: unknown): value is CoreErrorInfo {
  return isRecord(value) && typeof value.code === "string" && typeof value.message === "string";
}

export function unwrapV1<T>(envelope: ApiEnvelope<T>): T {
  if (!isRecord(envelope) || envelope.apiVersion !== "v1") {
    throw new Error(`Unsupported API version: ${isRecord(envelope) ? String(envelope.apiVersion) : "unknown"}`);
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
  return envelope.data as T;
}

export function toUiError(error: CoreErrorInfo): UiError {
  return { code: error.code, message: error.message };
}

export function canUseCleanupMode(capabilities: CleanupCapabilities | null, mode: "Trash" | "Permanent") {
  return capabilities !== null && (mode === "Permanent" ? capabilities.permanent : capabilities.trash);
}
