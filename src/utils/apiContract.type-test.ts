import type { ApiEnvelope, RawApiEnvelope } from "./apiContract";

export const validV1Envelope: ApiEnvelope<unknown> = {
  apiVersion: "v1",
  platform: "windows",
  data: {},
  error: null,
};

export const rawUnknownEnvelope: RawApiEnvelope = {
  apiVersion: "v2",
  platform: "windows",
  data: {},
  error: null,
};

export const invalidV1Envelope: ApiEnvelope<unknown> = {
  // @ts-expect-error v1 envelope types must not accept arbitrary API versions.
  apiVersion: "v2",
  platform: "windows",
  data: {},
  error: null,
};
