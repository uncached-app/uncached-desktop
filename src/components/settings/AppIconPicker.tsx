import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Check, LockKeyhole } from "lucide-react";
import { useTranslation } from "react-i18next";
import { describeFailure } from "../../i18n/errors";

/** Rendered by `scripts/icons.py --variants`, in the order the backend lists them. */
const previews = import.meta.glob<string>("../../../src-tauri/icons/variants/*.png", {
  eager: true,
  import: "default",
});

const VARIANTS = ["night", "hazard", "sunset", "olive", "ultraviolet", "evergreen"] as const;
const DEFAULT = "night";

function previewOf(id: string): string | undefined {
  return Object.entries(previews).find(([path]) => path.endsWith(`/${id}.png`))?.[1];
}

/** The Dock (or window) icon. The default is free; the rest are Pro. */
export function AppIconPicker({
  current,
  proEnabled,
  onApplied,
}: {
  current: string | null;
  proEnabled: boolean;
  onApplied: (icon: string | null) => void;
}) {
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);
  const selected = current ?? DEFAULT;

  async function choose(id: string) {
    if (id === selected || (!proEnabled && id !== DEFAULT)) return;
    setError(null);
    const icon = id === DEFAULT ? null : id;
    try {
      await invoke("set_app_icon", { variant: icon });
      onApplied(icon);
    } catch (failure) {
      setError(describeFailure(failure));
    }
  }

  return (
    <div className="py-4">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm text-mist-300">{t("settings.appearance.icon.label")}</span>
        {!proEnabled && (
          <span className="inline-flex items-center gap-1 text-[11px] text-pro-100">
            <LockKeyhole size={11} aria-hidden="true" />
            {t("settings.appearance.icon.pro")}
          </span>
        )}
      </div>
      <p className="mt-0.5 text-xs leading-5 text-mist-500">{t("settings.appearance.icon.hint")}</p>
      <div role="radiogroup" aria-label={t("settings.appearance.icon.label")} className="mt-3 grid grid-cols-6 gap-2.5">
        {VARIANTS.map((id) => {
          const locked = !proEnabled && id !== DEFAULT;
          const active = selected === id;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={active}
              aria-disabled={locked}
              aria-label={t(`settings.appearance.icon.variants.${id}`)}
              title={t(`settings.appearance.icon.variants.${id}`)}
              onClick={() => void choose(id)}
              className={`relative grid aspect-square place-items-center rounded-xl border p-1.5 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sage-400 ${
                active ? "border-sage-400 bg-forest-850" : "border-forest-800 hover:border-forest-700"
              } ${locked ? "cursor-not-allowed opacity-45" : "cursor-pointer"}`}
            >
              <img src={previewOf(id)} alt="" className="size-full" draggable={false} />
              {active && (
                <span className="absolute -end-1 -top-1 grid size-4 place-items-center rounded-full bg-sage-400 text-forest-950">
                  <Check size={10} strokeWidth={3} aria-hidden="true" />
                </span>
              )}
            </button>
          );
        })}
      </div>
      {error && (
        <p role="alert" className="mt-2 text-xs text-coral-300">
          {error}
        </p>
      )}
    </div>
  );
}
