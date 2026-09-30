import type { ConfidenceLevel } from "./scan";

/** Mirrors `uncached-core/src/dependencies/mod.rs`. */
export type DependencyKind = "runtime" | "development" | "build" | "optional";

export type UnusedReason =
  | "notReferenced"
  | "conventionLoaded"
  | "commandOnly"
  | "typesOnly"
  | "featuresOrLinkage"
  | "notInstalled"
  | "incompleteScan";

export type UnusedDependency = {
  name: string;
  kind: DependencyKind;
  confidence: ConfidenceLevel;
  reason: UnusedReason;
  /** Run from the manifest's directory. Copied, never run by the app. */
  removeWith: string;
};

export type DependencyReport = {
  manifest: string;
  ecosystem: "node" | "cargo";
  declared: number;
  unused: UnusedDependency[];
};

export type ProjectDependencies = {
  project: string;
  reports: DependencyReport[];
  /** Manifests that could not be read or parsed. */
  unreadable: string[];
};
