import { useEffect, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { Settings, X } from "lucide-react";
import { LicenseSection } from "./LicenseSection";
import type { UpdateState } from "../../hooks/useUpdate";
import { Select } from "../shared/Select";
import { ShortcutsContent } from "./ShortcutsContent";
import { useThemeFiles, type UserTheme } from "../../hooks/useThemeFiles";
import type { AppSettings } from "../../types/settings";
import type { UpdateSettings } from "./types";
import { DeletionContent } from "./sections/DeletionContent";
import { AppearanceContent } from "./sections/AppearanceContent";
import { AboutContent } from "./sections/AboutContent";
import { IgnoreRulesContent } from "./sections/IgnoreRulesContent";
import { GeneralContent } from "./sections/GeneralContent";
import { ScanningContent } from "./sections/ScanningContent";
import { OpeningContent } from "./sections/OpeningContent";

type SettingsPanelProps = {
  open: boolean;
  onClose: () => void;
  settings: AppSettings | null;
  loading: boolean;
  saving: boolean;
  error: string | null;
  updateSettings: UpdateSettings;
  /** The plan is native state; activating one has to re-read it. */
  onLicenseChange?: () => void;
  /** Read by the licence screen alone, which is the only thing here it gates. */
  proEnabled?: boolean;
  /** Shared with the titlebar badge, so one check answers both. */
  update: UpdateState;
  /** Opens the update dialog, which owns the notes, the progress and the restart. */
  onOpenUpdate: () => void;
};

const sections = [
  "general",
  "opening",
  "scanning",
  "ignoreRules",
  "deletion",
  "shortcuts",
  "appearance",
  "licence",
  "about",
] as const;

type Section = (typeof sections)[number];

export function SettingsPanel({
  open,
  onClose,
  settings,
  loading,
  saving,
  error,
  updateSettings,
  onLicenseChange = () => { },
  proEnabled = false,
  update,
  onOpenUpdate,
}: SettingsPanelProps) {
  const { t } = useTranslation();
  const [section, setSection] = useState<Section>("general");
  const [appInfo, setAppInfo] = useState<{ name: string; version: string; website: string } | null>(
    null,
  );
  const [confirmPermanent, setConfirmPermanent] = useState(false);
  // Re-read when the window comes back, because writing one of these means
  // leaving for an editor and returning.
  const { themes } = useThemeFiles();

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  useEffect(() => {
    if (open) {
      void invoke<{ name: string; version: string; website: string }>("get_app_info").then(
        setAppInfo,
      );
    }
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="ui-fade fixed inset-0 z-40 grid place-items-center bg-forest-950/60 p-4 backdrop-blur-xs select-none"
      onClick={onClose}
    >
      {/* The titlebar is underneath this, and a covered drag region is not one.
          Without this strip the window cannot be moved while settings is open. */}
      <div data-tauri-drag-region className="absolute inset-x-0 top-0 h-12" />
      <section
        role="dialog"
        aria-modal="true"
        aria-label={t("settings.title")}
        onClick={(event) => event.stopPropagation()}
        className="ui-rise flex h-[min(680px,calc(100vh-32px))] w-full max-w-3xl overflow-hidden rounded-3xl border border-forest-800 bg-forest-900 shadow-2xl"
      >
        {/* Left Sidebar */}
        <aside className="hidden w-52 shrink-0 border-e border-forest-800 bg-forest-950 sm:flex sm:flex-col">
          <div className="flex h-14 items-center gap-2.5 border-b border-forest-800 px-5 text-sm font-semibold text-mist-100">
            <Settings size={16} className="text-sage-300" />
            <span>{t("settings.title")}</span>
          </div>
          <nav className="flex-1 space-y-1 p-3.5 overflow-y-auto" aria-label={t("settings.sectionNav")}>
            {sections.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setSection(item)}
                className={`flex w-full items-center rounded-xl px-3 py-2.5 text-start text-xs font-medium transition-colors cursor-pointer ${section === item
                    ? "bg-forest-850 font-semibold text-mist-100 shadow-2xs"
                    : "text-mist-500 hover:bg-forest-900 hover:text-mist-300"
                  }`}
              >
                {t(`settings.sections.${item}`)}
              </button>
            ))}
          </nav>
        </aside>

        {/* Right Main Content Area */}
        <div className="flex min-w-0 flex-1 flex-col bg-forest-900">
          {/* Header Row */}
          <header className="flex h-14 shrink-0 items-center justify-between border-b border-forest-800 px-6 sm:px-8">
            <div className="flex items-center gap-2.5 sm:hidden">
              <Settings size={16} className="text-sage-300" />
              <span className="text-sm font-semibold text-mist-100">{t("settings.title")}</span>
            </div>
            <h2 className="hidden text-base font-semibold text-mist-100 sm:block">
              {t(`settings.sections.${section}`)}
            </h2>
            <Select
              label={t("settings.sectionPicker")}
              size="sm"
              value={section}
              options={sections.map((item) => ({ value: item, label: t(`settings.sections.${item}`) }))}
              onChange={(value) => setSection(value as Section)}
              className="sm:hidden"
            />
            <button
              type="button"
              onClick={onClose}
              className="grid size-8 shrink-0 place-items-center rounded-xl border border-forest-800 bg-forest-850 text-mist-400 hover:border-forest-750 hover:bg-forest-800 hover:text-mist-100 transition-colors cursor-pointer"
              aria-label={t("settings.close")}
            >
              <X size={15} />
            </button>
          </header>

          {/* Body Content */}
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6 sm:px-8">
            {section === "licence" ? (
              <LicenseSection onActivated={onLicenseChange} proEnabled={proEnabled} />
            ) : section === "about" ? (
              <AboutContent appInfo={appInfo} update={update} onOpenUpdate={onOpenUpdate} />
            ) : loading || !settings ? (
              <div className="grid h-full place-items-center text-xs text-mist-500">
                {t("settings.loading")}
              </div>
            ) : (
              <SettingsContent
                section={section}
                settings={settings}
                updateSettings={updateSettings}
                themes={themes}
                proEnabled={proEnabled}
                onRequestPermanentDelete={() => setConfirmPermanent(true)}
              />
            )}
            {error && (
              <p
                className="mt-5 rounded-xl border border-coral-300/30 bg-coral-300/10 px-4 py-3 text-xs text-coral-300 select-text"
                role="alert"
              >
                {error}
              </p>
            )}
          </div>

          {/* Footer Row */}
          <footer className="flex h-11 shrink-0 items-center justify-end border-t border-forest-800 px-6 sm:px-8 text-xs text-mist-500">
            <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-mist-500">
              <span
                className={`size-1.5 rounded-full ${saving ? "bg-sage-400 animate-pulse" : "bg-forest-700"
                  }`}
              />
              {saving ? t("settings.saving") : t("settings.saved")}
            </span>
          </footer>
        </div>
      </section>

      {/* Confirmation Modal for Permanent Delete Mode */}
      {confirmPermanent && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-forest-950/70 backdrop-blur-xs p-5"
          onClick={(event) => event.stopPropagation()}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-sm rounded-3xl border border-forest-800 bg-forest-900 p-6 shadow-2xl"
          >
            <h2 className="text-lg font-semibold text-mist-100">
              {t("settings.permanentConfirm.title")}
            </h2>
            <p className="mt-2.5 text-xs leading-5 text-mist-400">
              <Trans
                i18nKey="settings.permanentConfirm.body"
                values={{ word: "Nuke" }}
                components={{ strong: <strong className="font-mono text-coral-300 font-bold" /> }}
              />
            </p>
            <div className="mt-6 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setConfirmPermanent(false)}
                className="rounded-xl border border-forest-800 bg-forest-850 px-3.5 py-2 text-xs font-medium text-mist-300 hover:bg-forest-800 cursor-pointer"
              >
                {t("settings.cancel")}
              </button>
              <button
                type="button"
                onClick={() => {
                  void updateSettings({ defaultCleanMode: "Permanent" });
                  setConfirmPermanent(false);
                }}
                className="rounded-xl bg-coral-300 px-3.5 py-2 text-xs font-semibold text-forest-950 hover:opacity-90 cursor-pointer"
              >
                {t("settings.permanentConfirm.confirm")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SettingsContent({
  section,
  settings,
  updateSettings,
  themes,
  proEnabled,
  onRequestPermanentDelete,
}: {
  themes: UserTheme[];
  proEnabled: boolean;
  section: Section;
  settings: AppSettings;
  updateSettings: UpdateSettings;
  onRequestPermanentDelete: () => void;
}) {
  if (section === "general") {
    return <GeneralContent settings={settings} updateSettings={updateSettings} proEnabled={proEnabled} />;
  }
  if (section === "opening") {
    return <OpeningContent settings={settings} updateSettings={updateSettings} />;
  }
  if (section === "scanning") {
    return <ScanningContent settings={settings} updateSettings={updateSettings} />;
  }
  if (section === "ignoreRules") {
    return <IgnoreRulesContent settings={settings} updateSettings={updateSettings} />;
  }
  if (section === "shortcuts") {
    return <ShortcutsContent settings={settings} updateSettings={updateSettings} />;
  }
  if (section === "deletion") {
    return (
      <DeletionContent
        settings={settings}
        updateSettings={updateSettings}
        onRequestPermanentDelete={onRequestPermanentDelete}
      />
    );
  }
  return (
    <AppearanceContent
      settings={settings}
      updateSettings={updateSettings}
      themes={themes}
      proEnabled={proEnabled}
    />
  );
}
