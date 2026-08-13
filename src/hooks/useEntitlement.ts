import { useEffect, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import type { EntitlementStatus } from "../types/entitlements";

const FREE_STATUS: EntitlementStatus = { plan: "free", proEnabled: false };

export function useEntitlement() {
  const [status, setStatus] = useState<EntitlementStatus>(FREE_STATUS);

  useEffect(() => {
    if (!isTauri()) return;
    void invoke<EntitlementStatus>("get_entitlement_status")
      .then((value) => {
        if (value?.plan === "free" || value?.plan === "pro") setStatus(value);
      })
      .catch(() => setStatus(FREE_STATUS));
  }, []);

  return status;
}
