/** Mirrors `portrait.mjs` so the module can be consumed from TypeScript. */
import type { Footprint, Verdict, WorkspaceProject } from "../types/workspace";

export type PortraitCategory = {
  category: string;
  bytes: number;
};

export type PortraitVerdict = {
  verdict: Verdict;
  count: number;
};

export type Portrait = {
  projects: number;
  measured: number;
  /** Projects still being weighed. Above zero, the picture is partial. */
  pending: number;
  totalBytes: number;
  reclaimableBytes: number;
  sourceBytes: number;
  /** Heaviest first. */
  categories: PortraitCategory[];
  /** Most common first. */
  verdicts: PortraitVerdict[];
};

export function workspacePortrait(input: {
  projects: WorkspaceProject[];
  footprints: Record<string, Footprint>;
  verdicts: Record<string, Verdict>;
}): Portrait;
