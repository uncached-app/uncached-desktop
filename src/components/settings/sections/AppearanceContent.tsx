import { useEffect, useRef, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { Monitor, Moon, Sun } from "lucide-react";
import { AppIconPicker } from "../AppIconPicker";
import { Select } from "../../shared/Select";
import { type UserTheme } from "../../../hooks/useThemeFiles";
import { paintTheme } from "../../../hooks/useTheme";
import type { AppSettings, Appearance } from "../../../types/settings";
import type { UpdateSettings } from "../types";
import { SettingsGroup, SettingRadio } from "./controls";

export function AppearanceContent({
  settings,
  updateSettings,
  themes,
  proEnabled,
}: {
  settings: AppSettings;
  updateSettings: UpdateSettings;
  themes: UserTheme[];
  proEnabled: boolean;
}) {
  const { t } = useTranslation();
  // Named rather than swallowed: a colour the app could not read is a line
  // somebody typed, and the only thing worse than not applying it is not
  // saying so.
  const chosen = themes.find((entry) => entry.id === settings.theme) ?? null;
  const problems = chosen?.problems ?? [];

  // The theme the list is resting on, which is not yet the theme.
  //
  // A theme is a thing you have to see, and the only way to see one was to
  // choose it — so trying four meant four saves and four trips back. The
  // highlight in the list drives this, so arrowing through the options paints
  // the window exactly as hovering them does.
  const [preview, setPreview] = useState<string | null>(null);
  const shown = preview === null ? chosen : (themes.find((entry) => entry.id === preview) ?? null);

  useEffect(() => {
    paintTheme(settings.appearance, shown);
  }, [settings.appearance, shown]);

  // The preview has become the truth, so it stops being a preview. Without
  // this the override outlives the choice it was showing, and the next change
  // to the saved theme would paint nothing.
  useEffect(() => {
    if (preview !== null && preview === (settings.theme ?? "")) setPreview(null);
  }, [preview, settings.theme]);

  // Leaving this screen with a preview applied would strand the window in a
  // theme nobody picked: `useTheme` sits above the settings panel and has no
  // reason to re-run just because the panel closed.
  const saved = useRef({ appearance: settings.appearance, theme: chosen });
  saved.current = { appearance: settings.appearance, theme: chosen };
  useEffect(() => () => paintTheme(saved.current.appearance, saved.current.theme), []);

  // A theme carrying one mode answers with that mode whatever is asked, so the
  // other choices are shown as unavailable rather than offered and overruled.
  // Which is what the appearance row would otherwise be: a control that keeps
  // its selection and changes nothing on screen.
  const only = chosen && !(chosen.light && chosen.dark) ? (chosen.light ? "light" : "dark") : null;
  const locked = (mode: Appearance) => only !== null && mode !== only;
  // The row is greyed and its pointer says no; neither says why. The paragraph
  // above does, and somebody who arrives at the row it is about has already
  // read past it.
  const because = only
    ? t(only === "light" ? "settings.appearance.lacksDark" : "settings.appearance.lacksLight", {
      name: chosen?.name,
    })
    : undefined;

  return (
    <>
      <p className="mb-4 text-xs leading-5 text-mist-500">
        {only
          ? t(only === "light" ? "settings.appearance.lockedToLight" : "settings.appearance.lockedToDark", {
            name: chosen?.name,
          })
          : t("settings.appearance.intro")}
      </p>
      <SettingsGroup>
        <SettingRadio
          icon={<Moon size={15} />}
          label={t("settings.appearance.dark.label")}
          hint={t("settings.appearance.dark.hint")}
          selected={only ? only === "dark" : settings.appearance === "dark"}
          disabled={locked("dark")}
          unavailable={because}
          onClick={() => updateSettings({ appearance: "dark" as Appearance })}
        />
        <SettingRadio
          icon={<Sun size={15} />}
          label={t("settings.appearance.light.label")}
          hint={t("settings.appearance.light.hint")}
          selected={only ? only === "light" : settings.appearance === "light"}
          disabled={locked("light")}
          unavailable={because}
          onClick={() => updateSettings({ appearance: "light" as Appearance })}
        />
        <SettingRadio
          icon={<Monitor size={15} />}
          label={t("settings.appearance.system.label")}
          hint={t("settings.appearance.system.hint")}
          selected={only ? false : settings.appearance === "system"}
          disabled={only !== null}
          unavailable={because}
          onClick={() => updateSettings({ appearance: "system" as Appearance })}
        />
      </SettingsGroup>

      <p className="mt-7 mb-4 text-xs leading-5 text-mist-500">
        {t("settings.appearance.themesIntro")}
      </p>
      <SettingsGroup>
        <div className="flex items-center justify-between gap-4 py-4 text-sm text-mist-300">
          <span className="flex min-w-0 flex-col gap-0.5">
            <span>{t("settings.appearance.theme.label")}</span>
            <span className="text-xs leading-5 text-mist-500">
              {problems.length > 0
                ? problems[0]
                : chosen && chosen.light && chosen.dark
                  ? t("settings.appearance.theme.both")
                  : t("settings.appearance.theme.yours", {
                    count: themes.filter((entry) => !entry.builtIn).length,
                  })}
            </span>
          </span>
          <Select
            label={t("settings.appearance.theme.label")}
            value={settings.theme ?? ""}
            options={[
              { value: "", label: "Garbage Man" },
              ...themes.map((entry) => ({
                value: entry.id,
                label: entry.builtIn
                  ? entry.name
                  : t("settings.appearance.theme.custom", { name: entry.name }),
              })),
            ]}
            onChange={(value) => void updateSettings({ theme: value === "" ? null : value })}
            onPreview={setPreview}
            className="w-44 shrink-0"
          />
        </div>

        <AppIconPicker
          current={settings.appIcon ?? null}
          proEnabled={proEnabled}
          onApplied={(appIcon) => void updateSettings({ appIcon })}
        />

        <div className="flex items-center justify-between gap-4 py-4 text-sm text-mist-300">
          <span className="flex min-w-0 flex-col gap-0.5">
            <span>{t("settings.appearance.files.label")}</span>
            <span className="text-xs leading-5 text-mist-500">
              <Trans
                i18nKey="settings.appearance.files.hint"
                values={{ file: "settings.json", folder: "themes" }}
                components={{ mono: <span className="font-mono text-mist-300" /> }}
              />
            </span>
          </span>
          <button
            type="button"
            onClick={() => void invoke("reveal_config").catch(() => { })}
            className="shrink-0 cursor-pointer rounded-xl border border-forest-800 bg-forest-950 px-3 py-2 text-xs font-medium text-mist-300 transition-colors hover:border-sage-400/60 hover:text-mist-100"
          >
            {t("settings.appearance.files.open")}
          </button>
        </div>
      </SettingsGroup>
    </>
  );
}
