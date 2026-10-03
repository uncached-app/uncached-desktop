import { useTranslation } from "react-i18next";
import { Select } from "../../shared/Select";
import type { AppSettings } from "../../../types/settings";
import { LOCALES, resolveLocale } from "../../../i18n/locales.mjs";
import type { LanguagePreference } from "../../../i18n/locales.d.mts";
import type { UpdateSettings } from "../types";
import { SettingsGroup, SettingToggle } from "./controls";

export function GeneralContent({
  settings,
  updateSettings,
  proEnabled,
}: {
  settings: AppSettings;
  updateSettings: UpdateSettings;
  proEnabled: boolean;
}) {
  const { t } = useTranslation();
  const systemTag = resolveLocale("system", navigator.languages);
  const systemName = LOCALES.find((locale) => locale.tag === systemTag)?.name ?? systemTag;

  return (
    <>
      <p className="mb-4 text-xs leading-5 text-mist-500">{t("settings.general.intro")}</p>
      <SettingsGroup>
        <div className="flex items-center justify-between gap-4 py-4 text-sm text-mist-300">
          <span className="flex min-w-0 flex-col gap-0.5">
            <span>{t("settings.language.label")}</span>
            <span className="text-xs leading-5 text-mist-500">{t("settings.language.hint")}</span>
          </span>
          <Select
            label={t("settings.language.label")}
            value={settings.language ?? "system"}
            options={[
              { value: "system", label: t("settings.language.system", { name: systemName }) },
              ...LOCALES.map((locale) => ({ value: locale.tag, label: locale.name })),
            ]}
            onChange={(value) => void updateSettings({ language: value as LanguagePreference })}
            className="w-52 shrink-0"
          />
        </div>
        <SettingToggle
          label={t("settings.general.openAtStartup.label")}
          hint={t("settings.general.openAtStartup.hint")}
          checked={settings.openAtStartup}
          onChange={(value) => updateSettings({ openAtStartup: value })}
        />
        <SettingToggle
          label={t("settings.general.keepRunning.label")}
          hint={t("settings.general.keepRunning.hint")}
          checked={settings.keepRunningInBackground}
          onChange={(value) => updateSettings({ keepRunningInBackground: value })}
        />
        {proEnabled && (
          <SettingToggle
            label={t("settings.general.weeklyDigest.label")}
            hint={t("settings.general.weeklyDigest.hint")}
            checked={settings.weeklyDigest}
            onChange={(value) => updateSettings({ weeklyDigest: value })}
          />
        )}
        <SettingToggle
          label={t("settings.general.rememberWorkspace.label")}
          hint={t("settings.general.rememberWorkspace.hint")}
          checked={settings.rememberLastWorkspace}
          onChange={(value) => updateSettings({ rememberLastWorkspace: value })}
        />
        <SettingToggle
          label={t("settings.general.checkUpdates.label")}
          hint={t("settings.general.checkUpdates.hint")}
          checked={settings.checkForUpdates}
          onChange={(value) => updateSettings({ checkForUpdates: value })}
        />
      </SettingsGroup>
    </>
  );
}
