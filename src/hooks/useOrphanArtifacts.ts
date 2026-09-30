import { useCallback, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { EMPTY_ORPHANS, type OrphanReport } from "../types/orphans";
import { describeFailure } from "../i18n/errors";

/**
 * Regenerable directories under the chosen folders that no project claims.
 *
 * Asked for rather than run on arrival, like the duplicate report beside it:
 * this is a walk of the workspace looking for something most machines do not
 * have, and a walk nobody asked for is not worth the fans.
 *
 * It takes the chosen roots, not the indexed project paths. An orphan is
 * defined by there being no project over it, so a list of projects is the one
 * input that cannot contain one.
 */
export function useOrphanArtifacts(roots: string[]) {
  const [report, setReport] = useState<OrphanReport | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scan = useCallback(async () => {
    if (!isTauri() || roots.length === 0) return;
    setRunning(true);
    setError(null);
    try {
      setReport(await invoke<OrphanReport>("orphan_artifacts", { paths: roots }));
    } catch (scanError) {
      setError(describeFailure(scanError));
      setReport(EMPTY_ORPHANS);
    } finally {
      setRunning(false);
    }
  }, [roots]);

  return { report, running, error, scan };
}
