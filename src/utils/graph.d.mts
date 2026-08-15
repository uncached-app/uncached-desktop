/** Mirrors `graph.mjs` so the module can be consumed from TypeScript. */
import type { DuplicatePackage } from "../types/duplicates";
import type { Footprint, Verdict, WorkspaceProject } from "../types/workspace";

export declare const MAX_NODES: number;
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
  /** 0..1 in a unit square. The component scales it. */
  x: number;
  y: number;
  /** Project nodes only. */
  path?: string;
  verdict?: Verdict;
};

export type GraphEdge = {
  id: string;
  /** `copy`: a project holds this package. `clone`: one repository, two checkouts. */
  kind: "copy" | "clone";
  from: string;
  to: string;
};

export type WorkspaceGraph = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  packagesOmitted: number;
  /** Past `MAX_NODES` the picture stops being one. */
  tooLarge: boolean;
};

export declare function workspaceGraph(input: {
  projects: WorkspaceProject[];
  footprints: Record<string, Footprint>;
  verdicts: Record<string, Verdict>;
  packages: DuplicatePackage[];
  limit?: number;
}): WorkspaceGraph;

export declare function projectRadiusCeiling(
  count: number,
  bounds?: { max?: number; min?: number },
): number;

export declare function packageRadiusCeiling(
  count: number,
  bounds?: { max?: number; min?: number },
): number;

export declare function nodeRadius(
  weight: number | null,
  heaviest: number,
  bounds?: { min?: number; max?: number },
): number;
