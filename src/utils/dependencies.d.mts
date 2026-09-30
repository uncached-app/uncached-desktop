import type { ProjectDependencies } from "../types/dependencies";

export type Scope = "high" | "all";

export function visibleDependencies(projects: ProjectDependencies[], scope: Scope): ProjectDependencies[];

export function relativeManifest(project: string, manifest: string): string;
