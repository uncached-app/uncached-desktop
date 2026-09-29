import { AlertTriangle, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { ACTIONS, DEFAULT_BINDINGS } from "../../actions";
import { bindingFrom, conflictsIn, formatBinding, resolveBindings } from "../../utils/keys.mjs";
import type { AppSettings } from "../../types/settings";

/**
 * Every key the app answers to, and the way to change one.
 *
 * The bindings were configurable before this existed and reachable only by
 * hand-editing `settings.json` — which meant knowing the action ids, none of
 * which were written down anywhere a user would look. A setting nobody can find
 * is a setting nobody has.
 *
 * A new key is recorded by pressing it rather than typed. The file spelling is
 * `cmd+shift+x`, and asking somebody to write that correctly is asking them to
 * learn a format to do a thing they can demonstrate in one gesture.
 */
export function ShortcutsContent({
  settings,
  updateSettings,
}: {
  settings: AppSettings;
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>;
}) {
  const { t } = useTranslation();
  const overrides = settings.shortcuts ?? {};
  const bindings = resolveBindings(DEFAULT_BINDINGS, overrides);
  const clashing = new Set(conflictsIn(bindings).flat());
  const [recording, setRecording] = useState<string | null>(null);

  // Captured before anything else sees it, so binding a key the app already
  // uses does not also run what it is currently bound to.
  useEffect(() => {
    if (!recording) return;

    const action = recording;
    function onKeyDown(event: KeyboardEvent) {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Escape") {
        setRecording(null);
        return;
      }
      const binding = bindingFrom(event);
      if (!binding) return;
      setRecording(null);
      void updateSettings({ shortcuts: { ...overrides, [action]: binding } });
    }

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [recording, overrides, updateSettings]);

  function reset(action: string) {
    const { [action]: _removed, ...rest } = overrides;
    void updateSettings({ shortcuts: rest });
  }

  return (
    <>
      <p className="mb-4 text-xs leading-5 text-mist-500">
        <Trans
          i18nKey="settings.shortcuts.intro"
          values={{ file: "settings.json" }}
          components={{ mono: <span className="font-mono text-mist-300" /> }}
        />
      </p>

      {clashing.size > 0 && (
        <p className="mb-4 flex items-start gap-2 rounded-xl border border-coral-300/40 bg-coral-surface px-3.5 py-2.5 text-xs leading-5 text-coral-300">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
          {t("settings.shortcuts.clash")}
        </p>
      )}

      <div className="divide-y divide-forest-800">
        {ACTIONS.map((action) => {
          const binding = bindings[action.id];
          const changed = overrides[action.id] !== undefined;
          const listening = recording === action.id;
          const label = t(`settings.shortcuts.actions.${action.id}.label`);

          return (
            <div key={action.id} className="flex items-center justify-between gap-4 py-3.5 text-sm">
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className={clashing.has(action.id) ? "text-coral-300" : "text-mist-300"}>
                  {label}
                </span>
                <span className="text-xs leading-5 text-mist-500">
                  {t(`settings.shortcuts.actions.${action.id}.detail`)}
                </span>
              </span>

              <span className="flex shrink-0 items-center gap-1.5">
                {changed && !listening && (
                  <button
                    type="button"
                    onClick={() => reset(action.id)}
                    title={t("settings.shortcuts.resetTitle", {
                      binding: formatBinding(DEFAULT_BINDINGS[action.id]),
                    })}
                    aria-label={t("settings.shortcuts.resetLabel", { action: label })}
                    className="grid size-7 cursor-pointer place-items-center rounded-lg text-mist-500 transition-colors hover:bg-forest-850 hover:text-mist-100"
                  >
                    <RotateCcw size={13} aria-hidden="true" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setRecording(listening ? null : action.id)}
                  className={`min-w-20 cursor-pointer rounded-lg border px-2.5 py-1.5 text-center font-mono text-xs transition-colors ${
                    listening
                      ? "border-sage-400 bg-forest-850 text-sage-300"
                      : clashing.has(action.id)
                        ? "border-coral-300/50 bg-forest-950 text-coral-300"
                        : "border-forest-800 bg-forest-950 text-mist-100 hover:border-sage-400/60"
                  }`}
                >
                  {listening ? t("settings.shortcuts.pressKey") : formatBinding(binding)}
                </button>
              </span>
            </div>
          );
        })}
      </div>

      <p className="mt-4 text-[11px] leading-5 text-mist-500">
        {t("settings.shortcuts.footer")}
      </p>
    </>
  );
}
