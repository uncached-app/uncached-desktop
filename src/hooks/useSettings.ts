import { useEffect, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import type { AppSettings } from "../types/settings";
import { describeFailure } from "../i18n/errors";

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isTauri()) {
      setError("Settings require the Tauri runtime.");
      setLoading(false);
      return;
    }

    invoke<AppSettings>("get_settings")
      .then((data) => {
        if (data?.appearance) {
          localStorage.setItem("uncached_appearance", data.appearance);
        }
        setSettings(data);
      })
      .catch((settingsError) => setError(describeFailure(settingsError)))
      .finally(() => setLoading(false));
  }, []);

  async function updateSettings(patch: Partial<AppSettings>) {
    if (!settings) return;
    setSaving(true);
    setError(null);
    try {
      if (patch.appearance) {
        localStorage.setItem("uncached_appearance", patch.appearance);
      }
      const updated = await invoke<AppSettings>("update_settings", {
        settings: { ...settings, ...patch },
      });
      setSettings(updated);
    } catch (settingsError) {
      setError(describeFailure(settingsError));
    } finally {
      setSaving(false);
    }
  }

  return { settings, loading, saving, error, updateSettings };
}
