import type { PackageFilter } from "../types/duplicates";
import type { Family, Footprint, Verdict, WorkspaceProject } from "../types/workspace";

export type NarrowFilters = {
  activeVerdict: Verdict | null;
  verdicts: Record<string, Verdict>;
  activeCategory: string | null;
  footprints: Record<string, Footprint>;
  clonesOnly: boolean;
  activePackage: PackageFilter | null;
};

export type NarrowDimension = "verdict" | "category" | "clones";

export function scopeProjects(
  projects: WorkspaceProject[],
  activeRoot: string | null,
  query: string,
): WorkspaceProject[];

export function narrowProjects(
  projects: WorkspaceProject[],
  filters: NarrowFilters,
  except: NarrowDimension | null,
): WorkspaceProject[];

export function countCategories(
  projects: WorkspaceProject[],
  footprints: Record<string, Footprint>,
): Array<[string, number]>;

export function countVerdicts(
  projects: WorkspaceProject[],
  verdicts: Record<string, Verdict>,
  order: readonly Verdict[],
): Array<readonly [Verdict, number]>;

export function sumFootprints(
  projects: WorkspaceProject[],
  footprints: Record<string, Footprint>,
): { totalBytes: number; reclaimableBytes: number };

export function countByRoot(projects: WorkspaceProject[]): Map<string, number>;

export function rankBySize(
  projects: WorkspaceProject[],
  footprints: Record<string, Footprint>,
): WorkspaceProject[];

export function visibleFamilies(families: Family[], visible: WorkspaceProject[]): Family[];

export function groupByFamily(
  families: Family[],
  visible: WorkspaceProject[],
  footprints: Record<string, Footprint>,
): { groups: Array<{ family: Family; projects: WorkspaceProject[] }>; alone: WorkspaceProject[] };

export function groupByVerdict(
  projects: WorkspaceProject[],
  verdicts: Record<string, Verdict>,
  footprints: Record<string, Footprint>,
  order: readonly Verdict[],
): Array<readonly [Verdict, WorkspaceProject[]]>;
