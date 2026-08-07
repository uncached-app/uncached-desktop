import type { CleanMode } from "../types/settings";

export function requiresPermanentConfirmation(mode: CleanMode, confirmation: string): boolean;
export function getCleanupCopy(mode: CleanMode, removed: number): {
  result: string;
  recovery: string;
};
