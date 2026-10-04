import { useTranslation } from "react-i18next";
import { Select } from "../../shared/Select";
import { useLaunchers, type Launcher } from "../../../hooks/useLaunchers";
import type { AppSettings } from "../../../types/settings";
import type { UpdateSettings } from "../types";
import { SettingsGroup } from "./controls";

export function OpeningContent({
  settings,
  updateSettings,
}: {
  settings: AppSettings;
  updateSettings: UpdateSettings;
}) {
  const { t } = useTranslation();
  const launchers = useLaunchers();
  const editors = launchers?.filter((launcher) => launcher.kind === "editor") ?? null;
  const terminals = launchers?.filter((launcher) => launcher.kind === "terminal") ?? null;

  return (
    <>
      <p className="mb-4 text-xs leading-5 text-mist-500">{t("settings.opening.intro")}</p>
      <SettingsGroup>
        <LauncherChoice
          label={t("settings.opening.editor.label")}
          hint={t("settings.opening.editor.hint")}
          empty={t("settings.opening.editor.empty")}
          launchers={editors}
          chosen={settings.preferredEditor}
          onChoose={(preferredEditor) => updateSettings({ preferredEditor })}
        />
        <LauncherChoice
          label={t("settings.opening.terminal.label")}
          hint={t("settings.opening.terminal.hint")}
          empty={t("settings.opening.terminal.empty")}
          launchers={terminals}
          chosen={settings.preferredTerminal}
          onChoose={(preferredTerminal) => updateSettings({ preferredTerminal })}
        />
      </SettingsGroup>
    </>
  );
}

function LauncherChoice({
  label,
  hint,
  empty,
  launchers,
  chosen,
  onChoose,
}: {
  label: string;
  hint: string;
  empty: string;
  launchers: Launcher[] | null;
  chosen: string | null;
  onChoose: (id: string | null) => void;
}) {
  const { t } = useTranslation();
  const detecting = launchers === null;
  const none = !detecting && launchers.length === 0;
  const uninstalled =
    launchers !== null &&
    !none &&
    chosen !== null &&
    !launchers.some((launcher) => launcher.id === chosen);

  const options = [
    { value: "", label: t("settings.opening.automatic") },
    ...(launchers ?? []).map((launcher) => ({ value: launcher.id, label: launcher.name })),
    ...(uninstalled ? [{ value: chosen as string, label: t("settings.opening.notInstalled") }] : []),
  ];

  return (
    <div className="flex items-center justify-between gap-4 py-4 text-xs text-mist-300">
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-medium text-mist-100">{label}</span>
        <span className="text-xs leading-5 text-mist-500">
          {detecting
            ? t("settings.opening.detecting")
            : none
              ? empty
              : uninstalled
                ? t("settings.opening.uninstalled")
                : hint}
        </span>
      </span>
      <Select
        label={label}
        size="sm"
        value={chosen ?? ""}
        options={options}
        disabled={detecting || none}
        onChange={(value) => onChoose(value === "" ? null : value)}
        className="w-44 shrink-0 shadow-2xs"
      />
    </div>
  );
}
