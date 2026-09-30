import { useEffect, useRef, useState, type ReactNode } from "react";
import { Trans, useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { Monitor, Moon, Settings, Sun, X } from "lucide-react";
import { LicenseSection } from "./LicenseSection";
import { SupportActions } from "./SupportActions";
import { AppIconPicker } from "./AppIconPicker";
import type { UpdateState } from "../../hooks/useUpdate";
import { Select } from "../shared/Select";
import { useLaunchers, type Launcher } from "../../hooks/useLaunchers";
import { ShortcutsContent } from "./ShortcutsContent";
import { useThemeFiles, type UserTheme } from "../../hooks/useThemeFiles";
import { paintTheme } from "../../hooks/useTheme";
import type { AppSettings, Appearance, IgnoreRuleReview } from "../../types/settings";
import { openExternalUrl } from "../../utils/externalLink";
import { LOCALES, resolveLocale } from "../../i18n/locales.mjs";
import type { LanguagePreference } from "../../i18n/locales.d.mts";

type SettingsPanelProps = {
  open: boolean;
  onClose: () => void;
  settings: AppSettings | null;
  loading: boolean;
  saving: boolean;
  error: string | null;
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>;
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
  updateSettings: SettingsPanelProps["updateSettings"];
  onRequestPermanentDelete: () => void;
}) {
  if (section === "general") {
    return <GeneralContent settings={settings} updateSettings={updateSettings} />;
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

function DeletionContent({
  settings,
  updateSettings,
  onRequestPermanentDelete,
}: {
  settings: AppSettings;
  updateSettings: SettingsPanelProps["updateSettings"];
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

function AppearanceContent({
  settings,
  updateSettings,
  themes,
  proEnabled,
}: {
  settings: AppSettings;
  updateSettings: SettingsPanelProps["updateSettings"];
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

function AboutContent({
  appInfo,
  update,
  onOpenUpdate,
}: {
  appInfo: { name: string; version: string; website: string } | null;
  update: UpdateState;
  onOpenUpdate: () => void;
}) {
  const { t } = useTranslation();
  const websiteUrl = appInfo?.website ?? "https://uncached.app";
  const eulaUrl = "https://uncached.app/eula";

  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <img src="/brand/UNCACHED-ICON-HAZARD.svg" alt="" className="size-20" />
      <h3 className="mt-6 text-2xl font-semibold text-mist-100">{appInfo?.name ?? "Uncached"}</h3>
      <p className="mt-2 text-sm text-mist-500">{t("settings.about.tagline")}</p>
      <p className="mt-6 font-mono text-xs text-mist-500">
        {t("settings.about.version", { version: appInfo?.version ?? "..." })}
      </p>

      <UpdateStatus update={update} onOpenUpdate={onOpenUpdate} />
      <div className="mt-5 flex flex-col items-center gap-2">
        <a
          href={websiteUrl}
          onClick={(e) => openExternalUrl(websiteUrl, e)}
          className="text-sm text-sage-300 hover:text-sage-400"
        >
          uncached.app
        </a>
        <a
          href={eulaUrl}
          onClick={(e) => openExternalUrl(eulaUrl, e)}
          className="text-xs text-mist-500 hover:text-mist-300 underline"
        >
          {t("settings.about.eula")}
        </a>
      </div>
      <SupportActions />
    </div>
  );
}

const IGNORE_RULES_PLACEHOLDER = `node_modules
~/Library/Caches/Homebrew
/Users/me/work/client-project
!/Users/me/work/client-project/scratch`;

function IgnoreRulesContent({
  settings,
  updateSettings,
}: {
  settings: AppSettings;
  updateSettings: SettingsPanelProps["updateSettings"];
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(settings.ignoreRules);
  const [review, setReview] = useState<IgnoreRuleReview | null>(null);

  useEffect(() => {
    setDraft(settings.ignoreRules);
  }, [settings.ignoreRules]);

  useEffect(() => {
    let current = true;
    void invoke<IgnoreRuleReview>("review_ignore_rules", { text: draft })
      .then((result) => {
        if (current) setReview(result);
      })
      .catch(() => {
        if (current) setReview(null);
      });
    return () => {
      current = false;
    };
  }, [draft]);

  const problemLines = new Set((review?.problems ?? []).map((problem) => problem.line));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <p className="text-xs leading-5 text-mist-500">
        <Trans
          i18nKey="settings.ignoreRules.intro"
          values={{ syntax: ".gitignore", negation: "!" }}
          components={{ mono: <span className="font-mono text-mist-300" /> }}
        />
      </p>

      <textarea
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          if (draft !== settings.ignoreRules) void updateSettings({ ignoreRules: draft });
        }}
        spellCheck={false}
        placeholder={IGNORE_RULES_PLACEHOLDER}
        aria-label={t("settings.sections.ignoreRules")}
        aria-invalid={problemLines.size > 0}
        className="mt-4 min-h-44 flex-1 resize-none rounded-2xl border border-forest-800 bg-forest-950 p-4 font-mono text-xs leading-6 placeholder:text-mist-500/60 focus:outline-none focus:border-sage-400/60 shadow-2xs"
      />

      <div className="mt-3.5 shrink-0 space-y-2" aria-live="polite">
        {review &&
          review.problems.length > 0 &&
          review.problems.map((problem) => (
            <p
              key={problem.line}
              className="rounded-xl bg-confidence-review-surface px-4 py-2.5 text-xs leading-5 text-confidence-review"
            >
              {/* User text goes in as component children, never as `values`: Trans
                  parses the interpolated string for tags. */}
              <Trans
                i18nKey="settings.ignoreRules.problem"
                values={{ line: problem.line }}
                components={{
                  bold: <span className="font-semibold" />,
                  rule: <span className="font-mono">{problem.text.trim()}</span>,
                  reason: <>{problem.reason}</>,
                }}
              />
            </p>
          ))}
        {review && (
          <p className="text-xs text-mist-500">
            {review.active === 0
              ? t("settings.ignoreRules.empty")
              : t("settings.ignoreRules.inForce", { count: review.active })}
          </p>
        )}
      </div>
    </div>
  );
}

function GeneralContent({
  settings,
  updateSettings,
}: {
  settings: AppSettings;
  updateSettings: SettingsPanelProps["updateSettings"];
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

function ScanningContent({
  settings,
  updateSettings,
}: {
  settings: AppSettings;
  updateSettings: SettingsPanelProps["updateSettings"];
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

function OpeningContent({
  settings,
  updateSettings,
}: {
  settings: AppSettings;
  updateSettings: SettingsPanelProps["updateSettings"];
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

function SettingsGroup({ children }: { children: ReactNode }) {
  return <div className="divide-y divide-forest-800 border-y border-forest-800">{children}</div>;
}

/**
 * Clean iOS/macOS styled toggle switch matching the modal alignment.
 */
function SettingToggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-4 text-xs text-mist-100">
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-medium text-mist-100">{label}</span>
        {hint && <span className="text-xs leading-5 text-mist-500">{hint}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage-400 ${checked ? "bg-sage-400" : "bg-forest-800"
          }`}
      >
        <span
          aria-hidden="true"
          className={`pointer-events-none inline-block size-4 transform rounded-full bg-forest-950 shadow-xs transition duration-200 ease-in-out ${checked ? "translate-x-4 bg-forest-950" : "translate-x-0 bg-mist-300"
            }`}
        />
      </button>
    </div>
  );
}

function SettingRadio({
  icon,
  label,
  hint,
  selected,
  disabled = false,
  unavailable,
  onClick,
}: {
  icon?: ReactNode;
  label: string;
  hint?: string;
  selected: boolean;
  disabled?: boolean;
  /** Why this one cannot be chosen, for the row that cannot say it itself. */
  unavailable?: string;
  onClick: () => void;
}) {
  // `:hover` still matches a disabled button — the pointer is over it, and CSS
  // has no opinion about whether pressing would do anything. So a row that
  // could not be chosen still lit up on the way past, three times over: the
  // label, the icon and the dot each carried their own hover rule. Built here
  // rather than with a variant, so the condition is visible beside the styles
  // it gates.
  const live = !disabled;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={disabled ? unavailable : undefined}
      className={`group flex w-full items-center justify-between gap-4 py-4 text-start text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${
        disabled ? "" : "cursor-pointer"
      } ${selected ? "text-mist-100" : `text-mist-500 ${live ? "hover:text-mist-300" : ""}`}`}
    >
      <span className="flex min-w-0 flex-1 items-start gap-3">
        {icon && (
          <span
            className={`mt-0.5 shrink-0 text-mist-500 transition-colors ${live ? "group-hover:text-mist-300" : ""}`}
          >
            {icon}
          </span>
        )}
        <span className="flex flex-col gap-0.5">
          <span className={`font-medium ${selected ? "text-mist-100" : "text-mist-300"}`}>{label}</span>
          {hint && <span className="text-xs leading-5 text-mist-500">{hint}</span>}
        </span>
      </span>
      <span
        className={`grid size-4.5 shrink-0 place-items-center rounded-full border transition-colors ${selected
            ? "border-sage-400 bg-sage-400 text-forest-950"
            : `border-forest-750 bg-forest-950/60 ${live ? "group-hover:border-forest-700" : ""}`
          }`}
      >
        {selected && <span className="size-1.5 rounded-full bg-forest-950" />}
      </span>
    </button>
  );
}

/**
 * Where somebody who went looking finds out about updates.
 *
 * Asking is what happens here; reading and accepting happen in the dialog.
 * This pane is a centred column beside a logo and two links, and release notes
 * are prose — they were being wrapped into a ribbon at `max-w-xs`, with the
 * download progress reported in the same thread. What is left is the state in
 * one line and the button that leads to the rest.
 *
 * It stays the only place a failed check is reported. A CDN that could not be
 * reached is ordinary, and a permanent warning for it would be the app asking
 * to be worried about — but silence everywhere would leave "why has it not
 * updated" with no answer at all.
 */
function UpdateStatus({ update, onOpenUpdate }: { update: UpdateState; onOpenUpdate: () => void }) {
  const { t } = useTranslation();
  const offered = update.stage === "available" || update.stage === "ready";
  const busy = update.stage === "checking" || update.stage === "downloading";

  return (
    <div className="mt-3 flex flex-col items-center gap-2">
      {update.stage === "available" && (
        <p className="text-xs text-sage-300">
          {t("settings.about.update.available", { version: update.version ?? "" })}
        </p>
      )}
      {update.stage === "downloading" && (
        <p className="text-xs text-mist-500">
          {update.progress === null
            ? t("settings.about.update.downloading", { version: update.version ?? "" })
            : t("settings.about.update.downloadingProgress", {
              version: update.version ?? "",
              percent: Math.round(update.progress * 100),
            })}
        </p>
      )}
      {update.stage === "ready" && (
        <p className="text-xs text-sage-300">
          {t("settings.about.update.ready", { version: update.version ?? "" })}
        </p>
      )}
      {update.stage === "failed" && update.problem && (
        <p className="max-w-xs text-xs leading-5 text-mist-500">{update.problem}</p>
      )}

      <button
        type="button"
        onClick={() => (offered || busy ? onOpenUpdate() : void update.check(true))}
        disabled={update.stage === "checking"}
        className="cursor-pointer rounded-lg border border-forest-800 px-2.5 py-1 text-xs font-medium text-mist-300 transition-colors hover:border-sage-400/60 hover:bg-forest-850 hover:text-mist-100 disabled:cursor-default disabled:opacity-50"
      >
        {update.stage === "checking"
          ? t("settings.about.update.checking")
          : update.stage === "downloading"
            ? t("settings.about.update.showProgress")
            : update.stage === "available"
              ? t("settings.about.update.whatsNew")
              : update.stage === "ready"
                ? t("settings.about.update.restart")
                : t("settings.about.update.check")}
      </button>
    </div>
  );
}
