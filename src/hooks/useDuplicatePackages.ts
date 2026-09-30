import { useCallback, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { EMPTY_REPORT, type DuplicateReport } from "../types/duplicates";
import { describeFailure } from "../i18n/errors";

/**
 * The same package, installed once per project.
 *
 * Asked for rather than computed on arrival: this reads every `node_modules` in
 * the workspace, which is the most expensive thing the app does that nothing is
 * waiting on. A number nobody asked for is not worth a second of fans.
 */
export function useDuplicatePackages(projectPaths: string[]) {
  const [report, setReport] = useState<DuplicateReport | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scan = useCallback(async () => {
    if (!isTauri() || projectPaths.length === 0) return;
    setRunning(true);
    setError(null);
    try {
      setReport(await invoke<DuplicateReport>("duplicate_packages", { paths: projectPaths }));
    } catch (scanError) {
      setError(describeFailure(scanError));
      setReport(EMPTY_REPORT);
    } finally {
      setRunning(false);
    }
  }, [projectPaths]);

  return { report, running, error, scan };
}
