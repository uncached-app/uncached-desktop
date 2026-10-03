import { useTranslation } from "react-i18next";
import type { AppSettings } from "../../../types/settings";
import type { UpdateSettings } from "../types";
import { SettingsGroup, SettingRadio } from "./controls";

export function DeletionContent({
  settings,
  updateSettings,
  onRequestPermanentDelete,
}: {
  settings: AppSettings;
  updateSettings: UpdateSettings;
  onRequestPermanentDelete: () => void;
}) {
  const { t } = useTranslation();

  return (
    <>
      <p className="mb-4 text-xs leading-5 text-mist-500">{t("settings.deletion.intro")}</p>
      <SettingsGroup>
        <SettingRadio
          label={t("settings.deletion.trash.label")}
          hint={t("settings.deletion.trash.hint")}
          selected={settings.defaultCleanMode === "Trash"}
          onClick={() => updateSettings({ defaultCleanMode: "Trash" })}
        />
        <SettingRadio
          label={t("settings.deletion.permanent.label")}
          hint={t("settings.deletion.permanent.hint")}
          selected={settings.defaultCleanMode === "Permanent"}
          onClick={onRequestPermanentDelete}
        />
      </SettingsGroup>
    </>
  );
}
