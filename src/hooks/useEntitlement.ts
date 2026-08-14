import { useCallback, useEffect, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import type { EntitlementStatus } from "../types/entitlements";

const FREE_STATUS: EntitlementStatus = { plan: "free", proEnabled: false };

export function useEntitlement() {
  const [status, setStatus] = useState<EntitlementStatus>(FREE_STATUS);

  // Exposed so activating a licence can re-read the plan. The frontend never
  // sets it: the native layer is asked again, and answers from the signature it
  // just verified.
  const refresh = useCallback(() => {
    if (!isTauri()) return;
    void invoke<EntitlementStatus>("get_entitlement_status")
      .then((value) => {
        if (value?.plan === "free" || value?.plan === "pro") setStatus(value);
      })
      .catch(() => setStatus(FREE_STATUS));
  }, []);

  useEffect(refresh, [refresh]);

  return { ...status, refresh };
}
