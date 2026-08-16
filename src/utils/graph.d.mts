/** Mirrors `graph.mjs` so the module can be consumed from TypeScript. */
import type { DuplicatePackage } from "../types/duplicates";
import type { Family, Footprint, Verdict, WorkspaceProject } from "../types/workspace";

export declare const MAX_PACKAGES: number;

export type GraphNode = {
  id: string;
  kind: "project" | "package";
  label: string;
  detail: string;
  /** What it weighs, as a figure to print. */
  bytes: number;
  /** What it weighs, for drawing. `null` when it has not been measured. */
  weight: number | null;
  angle: number;
  /** In a box `width` by `height`. The component scales it. */
  x: number;
  y: number;
  /** Project nodes only. */
  path?: string;
  verdict?: Verdict;
  family?: string | null;
  /** What it was placed as: a family, or itself. */
  unit?: string;
};

export type GraphEdge = {
  id: string;
  /** `copy`: a project holds this package. `clone`: one repository, two checkouts. */
  kind: "copy" | "clone";
  from: string;
  to: string;
};

export type GraphLabel = {
  id: string;
  /** The directory itself, so it can be opened rather than only named. */
  path: string;
  text: string;
  detail: string;
  declared: boolean;
  members: number;
  x: number;
  y: number;
  /** How far the cluster reaches from its middle. */
  reach: number;
  /** Its members, so a reader asking about the folder gets its weight. */
  paths: string[];
  /** Points an outline passes through, already outside every member. */
  outline: Array<{ x: number; y: number }>;
};

export type WorkspaceGraph = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  labels: GraphLabel[];
  packagesOmitted: number;
  sharesNothing: boolean;
  /** The largest any node may draw before two of them touch. */
  maxRadius: number;
  width: number;
  height: number;
  /** What the whole drawing spans, which is larger than the box as soon as the workspace is. */
  extent: { x: number; y: number; width: number; height: number };
};

export declare function workspaceGraph(input: {
  projects: WorkspaceProject[];
  footprints: Record<string, Footprint>;
  verdicts: Record<string, Verdict>;
  packages: DuplicatePackage[];
  families?: Family[];
  limit?: number;
  /** Width over height of the area being drawn into. */
  aspect?: number;
}): WorkspaceGraph;

export declare function nodeRadius(
  weight: number | null,
  heaviest: number,
  ceiling: number,
): number;
