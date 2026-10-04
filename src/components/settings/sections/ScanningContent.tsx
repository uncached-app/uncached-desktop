import { useTranslation } from "react-i18next";
import type { AppSettings } from "../../../types/settings";
import type { UpdateSettings } from "../types";
import { SettingsGroup, SettingToggle } from "./controls";

export function ScanningContent({
  settings,
  updateSettings,
}: {
  settings: AppSettings;
  updateSettings: UpdateSettings;
}) {
  const { t } = useTranslation();
  const isMac = /Macintosh|Mac OS X/.test(navigator.userAgent);

  return (
    <>
      <p className="mb-4 text-xs leading-5 text-mist-500">{t("settings.scanning.intro")}</p>
      <SettingsGroup>
        <SettingToggle
          label={t("settings.scanning.packageManagers.label")}
          hint={t("settings.scanning.packageManagers.hint")}
          checked={settings.detectPackageManagerCaches}
          onChange={(value) => updateSettings({ detectPackageManagerCaches: value })}
        />
        <SettingToggle
          label={t("settings.scanning.aiTools.label")}
          hint={t("settings.scanning.aiTools.hint")}
          checked={settings.detectAiToolCaches}
          onChange={(value) => updateSettings({ detectAiToolCaches: value })}
        />
        <SettingToggle
          label={t("settings.scanning.editors.label")}
          hint={t("settings.scanning.editors.hint")}
          checked={settings.detectEditorCaches}
          onChange={(value) => updateSettings({ detectEditorCaches: value })}
        />
        <SettingToggle
          label={t("settings.scanning.gameEngines.label")}
          hint={t("settings.scanning.gameEngines.hint")}
          checked={settings.detectGameEngineCaches}
          onChange={(value) => updateSettings({ detectGameEngineCaches: value })}
        />
        <SettingToggle
          label={t("settings.scanning.androidSdk.label")}
          hint={t("settings.scanning.androidSdk.hint")}
          checked={settings.detectAndroidSdk}
          onChange={(value) => updateSettings({ detectAndroidSdk: value })}
        />
        <SettingToggle
          label={t("settings.scanning.containerStorage.label")}
          hint={t("settings.scanning.containerStorage.hint")}
          checked={settings.detectContainerStorage}
          onChange={(value) => updateSettings({ detectContainerStorage: value })}
        />
        {/* Xcode exists on one platform, and so does everything this switch
            reaches: the Linux and Windows catalogues list no Xcode locations at
            all. Shown elsewhere it would be a control with nothing behind it —
            the fault it was added to fix. */}
        {isMac && (
          <SettingToggle
            label={t("settings.scanning.xcode.label")}
            hint={t("settings.scanning.xcode.hint")}
            checked={settings.detectXcodeData}
            onChange={(value) => updateSettings({ detectXcodeData: value })}
          />
        )}
      </SettingsGroup>
      <p className="mt-4 text-xs leading-5 text-mist-500">{t("settings.scanning.footer")}</p>
    </>
  );
}
