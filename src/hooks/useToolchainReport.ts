import { useCallback, useEffect, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import type { ToolchainReport } from "../types/toolchains";

/** Reads installed toolchains against the pins of `paths`, once per change of the set. */
export function useToolchainReport(paths: string[]) {
  const [report, setReport] = useState<ToolchainReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const key = paths.join("\n");

  const read = useCallback(async () => {
    if (!isTauri() || key === "") return;
    setLoading(true);
    setFailed(false);
    try {
      setReport(await invoke<ToolchainReport>("toolchain_report", { paths: key.split("\n") }));
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [key]);

  useEffect(() => {
    void read();
  }, [read]);

  return { report, loading, failed, read };
}
