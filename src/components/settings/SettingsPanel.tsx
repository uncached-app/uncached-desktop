import { useEffect, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Monitor, Moon, Settings, Sun, X } from "lucide-react";
import { LicenseSection } from "./LicenseSection";
import type { UpdateState } from "../../hooks/useUpdate";
import { Select } from "../shared/Select";
import { useLaunchers, type Launcher } from "../../hooks/useLaunchers";
import { ShortcutsContent } from "./ShortcutsContent";
import { useThemeFiles, type UserTheme } from "../../hooks/useThemeFiles";
import type { AppSettings, Appearance, IgnoreRuleReview } from "../../types/settings";
import { openExternalUrl } from "../../utils/externalLink";

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
  "General",
  "Opening",
  "Scanning",
  "Ignore rules",
  "Deletion",
  "Shortcuts",
  "Appearance",
  "Licence",
  "About",
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
  const [section, setSection] = useState<Section>("General");
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
      className="fixed inset-0 z-40 grid place-items-center bg-forest-950/60 p-4 backdrop-blur-xs select-none"
      onClick={onClose}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        onClick={(event) => event.stopPropagation()}
        className="flex h-[min(680px,calc(100vh-32px))] w-full max-w-3xl overflow-hidden rounded-3xl border border-forest-800 bg-forest-900 shadow-2xl"
      >
        {/* Left Sidebar */}
        <aside className="hidden w-52 shrink-0 border-r border-forest-800 bg-forest-950 sm:flex sm:flex-col">
          <div className="flex h-14 items-center gap-2.5 border-b border-forest-800 px-5 text-sm font-semibold text-mist-100">
            <Settings size={16} className="text-sage-300" />
            <span>Settings</span>
          </div>
          <nav className="flex-1 space-y-1 p-3.5 overflow-y-auto" aria-label="Settings sections">
            {sections.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setSection(item)}
                className={`flex w-full items-center rounded-xl px-3 py-2.5 text-left text-xs font-medium transition-colors cursor-pointer ${section === item
                    ? "bg-forest-850 font-semibold text-mist-100 shadow-2xs"
                    : "text-mist-500 hover:bg-forest-900 hover:text-mist-300"
                  }`}
              >
                {item}
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
              <span className="text-sm font-semibold text-mist-100">Settings</span>
            </div>
            <h2 className="hidden text-base font-semibold text-mist-100 sm:block">{section}</h2>
            <Select
              label="Settings section"
              size="sm"
              value={section}
              options={sections.map((item) => ({ value: item, label: item }))}
              onChange={(value) => setSection(value as Section)}
              className="sm:hidden"
            />
            <button
              type="button"
              onClick={onClose}
              className="grid size-8 shrink-0 place-items-center rounded-xl border border-forest-800 bg-forest-850 text-mist-400 hover:border-forest-750 hover:bg-forest-800 hover:text-mist-100 transition-colors cursor-pointer"
              aria-label="Close settings"
            >
              <X size={15} />
            </button>
          </header>

          {/* Body Content */}
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6 sm:px-8">
            {section === "Licence" ? (
              <LicenseSection onActivated={onLicenseChange} proEnabled={proEnabled} />
            ) : section === "About" ? (
              <AboutContent appInfo={appInfo} update={update} onOpenUpdate={onOpenUpdate} />
            ) : loading || !settings ? (
              <div className="grid h-full place-items-center text-xs text-mist-500">
                Loading settings...
              </div>
            ) : (
              <SettingsContent
                section={section}
                settings={settings}
                updateSettings={updateSettings}
                themes={themes}
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
              {saving ? "Saving..." : "Saved automatically"}
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
            <h2 className="text-lg font-semibold text-mist-100">Enable permanent deletion?</h2>
            <p className="mt-2.5 text-xs leading-5 text-mist-400">
              Targets are deleted directly from disk instead of moved to the Recycle Bin. Not
              recoverable. Each cleanup will require typing{" "}
              <strong className="font-mono text-coral-300 font-bold">Nuke</strong> to confirm.
            </p>
            <div className="mt-6 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setConfirmPermanent(false)}
                className="rounded-xl border border-forest-800 bg-forest-850 px-3.5 py-2 text-xs font-medium text-mist-300 hover:bg-forest-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  void updateSettings({ defaultCleanMode: "Permanent" });
                  setConfirmPermanent(false);
                }}
                className="rounded-xl bg-coral-300 px-3.5 py-2 text-xs font-semibold text-forest-950 hover:opacity-90 cursor-pointer"
              >
                Enable permanent deletion
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
  onRequestPermanentDelete,
}: {
  themes: UserTheme[];
  section: Section;
  settings: AppSettings;
  updateSettings: SettingsPanelProps["updateSettings"];
  onRequestPermanentDelete: () => void;
}) {
  if (section === "General") {
    return (
      <>
        <p className="mb-4 text-xs leading-5 text-mist-500">
          Configure application startup, background operation and automatic updates.
        </p>
        <SettingsGroup>
          <SettingToggle
            label="Open at startup"
            hint="Automatically start Uncached when you log in to your computer."
            checked={settings.openAtStartup}
            onChange={(value) => updateSettings({ openAtStartup: value })}
          />
          <SettingToggle
            label="Keep running in the background"
            hint="Closing the window hides Uncached in the menu bar instead of quitting it. Scheduled maintenance runs from there; Quit ends it until you open the app again."
            checked={settings.keepRunningInBackground}
            onChange={(value) => updateSettings({ keepRunningInBackground: value })}
          />
          <SettingToggle
            label="Remember last workspace"
            hint="Restore your previously open folders and analysis automatically on launch."
            checked={settings.rememberLastWorkspace}
            onChange={(value) => updateSettings({ rememberLastWorkspace: value })}
          />
          <SettingToggle
            label="Check for updates"
            hint="Periodically check for new releases and security improvements."
            checked={settings.checkForUpdates}
            onChange={(value) => updateSettings({ checkForUpdates: value })}
          />
        </SettingsGroup>
      </>
    );
  }
  if (section === "Opening") {
    return <OpeningContent settings={settings} updateSettings={updateSettings} />;
  }
  if (section === "Scanning") {
    return <ScanningContent settings={settings} updateSettings={updateSettings} />;
  }
  if (section === "Ignore rules") {
    return <IgnoreRulesContent settings={settings} updateSettings={updateSettings} />;
  }
  if (section === "Shortcuts") {
    return <ShortcutsContent settings={settings} updateSettings={updateSettings} />;
  }
  if (section === "Deletion") {
    return (
      <DeletionContent
        settings={settings}
        updateSettings={updateSettings}
        onRequestPermanentDelete={onRequestPermanentDelete}
      />
    );
  }
  return <AppearanceContent settings={settings} updateSettings={updateSettings} themes={themes} />;
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
  return (
    <>
      <p className="mb-4 text-xs leading-5 text-mist-500">
        Choose how build artifacts and caches are removed from your disk during cleanup.
      </p>
      <SettingsGroup>
        <SettingRadio
          label="Move to Recycle Bin"
          hint="Reclaimable artifacts are moved to the system Recycle Bin/Trash, so cleanups can be reversed."
          selected={settings.defaultCleanMode === "Trash"}
          onClick={() => updateSettings({ defaultCleanMode: "Trash" })}
        />
        <SettingRadio
          label="Permanently delete"
          hint="Targets are deleted directly from disk to free up space immediately. Each run requires confirmation."
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
}: {
  settings: AppSettings;
  updateSettings: SettingsPanelProps["updateSettings"];
  themes: UserTheme[];
}) {
  // Named rather than swallowed: a colour the app could not read is a line
  // somebody typed, and the only thing worse than not applying it is not
  // saying so.
  const chosen = themes.find((entry) => entry.id === settings.theme) ?? null;
  const problems = chosen?.problems ?? [];

  // A theme carrying one mode answers with that mode whatever is asked, so the
  // other choices are shown as unavailable rather than offered and overruled.
  // Which is what the appearance row would otherwise be: a control that keeps
  // its selection and changes nothing on screen.
  const only = chosen && !(chosen.light && chosen.dark) ? (chosen.light ? "light" : "dark") : null;
  const locked = (mode: Appearance) => only !== null && mode !== only;

  return (
    <>
      <p className="mb-4 text-xs leading-5 text-mist-500">
        {only
          ? `${chosen?.name} is a ${only} theme — it carries no colours for the other, so this follows it.`
          : "Choose your interface theme."}
      </p>
      <SettingsGroup>
        <SettingRadio
          icon={<Moon size={15} />}
          label="Dark"
          hint="Sleek dark theme optimized for low-light development environments."
          selected={only ? only === "dark" : settings.appearance === "dark"}
          disabled={locked("dark")}
          onClick={() => updateSettings({ appearance: "dark" as Appearance })}
        />
        <SettingRadio
          icon={<Sun size={15} />}
          label="Light"
          hint="Clean high-contrast light theme."
          selected={only ? only === "light" : settings.appearance === "light"}
          disabled={locked("light")}
          onClick={() => updateSettings({ appearance: "light" as Appearance })}
        />
        <SettingRadio
          icon={<Monitor size={15} />}
          label="System"
          hint="Automatically follows your operating system appearance preference."
          selected={only ? false : settings.appearance === "system"}
          disabled={only !== null}
          onClick={() => updateSettings({ appearance: "system" as Appearance })}
        />
      </SettingsGroup>

      <p className="mt-7 mb-4 text-xs leading-5 text-mist-500">
        A theme file renames some of the app's colours and leaves the rest, so one written today
        still works after a release adds a surface.
      </p>
      <SettingsGroup>
        <div className="flex items-center justify-between gap-4 py-4 text-sm text-mist-300">
          <span className="flex min-w-0 flex-col gap-0.5">
            <span>Theme</span>
            <span className="text-xs leading-5 text-mist-500">
              {problems.length > 0
                ? problems[0]
                : chosen && chosen.light && chosen.dark
                  ? "Carries both light and dark."
                  : `${themes.filter((entry) => !entry.builtIn).length} of these are yours.`}
            </span>
          </span>
          <Select
            label="Theme"
            value={settings.theme ?? ""}
            options={[
              { value: "", label: "Uncached" },
              ...themes.map((entry) => ({
                value: entry.id,
                label: entry.builtIn ? entry.name : `${entry.name} (custom)`,
              })),
            ]}
            onChange={(value) => void updateSettings({ theme: value === "" ? null : value })}
            className="w-44 shrink-0"
          />
        </div>

        <div className="flex items-center justify-between gap-4 py-4 text-sm text-mist-300">
          <span className="flex min-w-0 flex-col gap-0.5">
            <span>Your settings and themes</span>
            <span className="text-xs leading-5 text-mist-500">
              <span className="font-mono text-mist-300">settings.json</span> and a{" "}
              <span className="font-mono text-mist-300">themes</span> folder, in your own Library.
              Edit either and come back — both are read again when the window is.
            </span>
          </span>
          <button
            type="button"
            onClick={() => void invoke("reveal_config").catch(() => { })}
            className="shrink-0 cursor-pointer rounded-xl border border-forest-800 bg-forest-950 px-3 py-2 text-xs font-medium text-mist-300 transition-colors hover:border-sage-400/60 hover:text-mist-100"
          >
            Open folder
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
  const websiteUrl = appInfo?.website ?? "https://uncached.app";
  const eulaUrl = "https://uncached.app/eula";

  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <img src="/brand/UNCACHED-ICON-LIGHT-BGDARK.svg" alt="" className="theme-logo-light size-20" />
      <img src="/brand/UNCACHED-ICON-DARK-NOBG.svg" alt="" className="theme-logo-dark size-20" />
      <h3 className="mt-6 text-2xl font-semibold text-mist-100">{appInfo?.name ?? "Uncached"}</h3>
      <p className="mt-2 text-sm text-mist-500">Reclaim disk from build artifacts.</p>
      <p className="mt-6 font-mono text-xs text-mist-500">Version {appInfo?.version ?? "..."}</p>

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
          End User License Agreement (EULA)
        </a>
      </div>
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
        Paths listed here are never scanned and never deleted, whatever the app finds there. One rule
        per line, in <span className="font-mono text-mist-300">.gitignore</span> syntax — a bare name
        matches anywhere, a full path matches that path and everything under it, and{" "}
        <span className="font-mono text-mist-300">!</span> makes an exception.
      </p>

      <textarea
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          if (draft !== settings.ignoreRules) void updateSettings({ ignoreRules: draft });
        }}
        spellCheck={false}
        placeholder={IGNORE_RULES_PLACEHOLDER}
        aria-label="Ignore rules"
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
              <span className="font-semibold">Line {problem.line}</span> could not be read, so it
              protects nothing: <span className="font-mono">{problem.text.trim()}</span> —{" "}
              {problem.reason}
            </p>
          ))}
        {review && (
          <p className="text-xs text-mist-500">
            {review.active === 0
              ? "No rules yet. Everything the scan finds is offered."
              : `${review.active} ${review.active === 1 ? "rule is" : "rules are"} in force.`}
          </p>
        )}
      </div>
    </div>
  );
}

function ScanningContent({
  settings,
  updateSettings,
}: {
  settings: AppSettings;
  updateSettings: SettingsPanelProps["updateSettings"];
}) {
  const isMac = /Macintosh|Mac OS X/.test(navigator.userAgent);

  return (
    <>
      <p className="mb-4 text-xs leading-5 text-mist-500">
        Build artifacts inside your folders are always detected. These are the caches that live
        elsewhere, written by tools rather than by a project.
      </p>
      <SettingsGroup>
        <SettingToggle
          label="Package manager caches"
          hint="Include npm, pnpm, yarn, cargo, and pip global package caches."
          checked={settings.detectPackageManagerCaches}
          onChange={(value) => updateSettings({ detectPackageManagerCaches: value })}
        />
        <SettingToggle
          label="AI tool caches"
          hint="Include local weights, completions, and embedding caches."
          checked={settings.detectAiToolCaches}
          onChange={(value) => updateSettings({ detectAiToolCaches: value })}
        />
        <SettingToggle
          label="Editor caches"
          hint="Include VS Code and JetBrains workspace metadata caches."
          checked={settings.detectEditorCaches}
          onChange={(value) => updateSettings({ detectEditorCaches: value })}
        />
        {/* Xcode exists on one platform, and so does everything this switch
            reaches: the Linux and Windows catalogues list no Xcode locations at
            all. Shown elsewhere it would be a control with nothing behind it —
            the fault it was added to fix. */}
        {isMac && (
          <SettingToggle
            label="Xcode developer data"
            hint="Include DerivedData, device support, and the simulator store."
            checked={settings.detectXcodeData}
            onChange={(value) => updateSettings({ detectXcodeData: value })}
          />
        )}
      </SettingsGroup>
      <p className="mt-4 text-xs leading-5 text-mist-500">
        To leave something inside a workspace alone, add it under Ignore rules — a rule there covers
        every kind of artifact and applies to scheduled runs too.
      </p>
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
  const launchers = useLaunchers();
  const editors = launchers?.filter((launcher) => launcher.kind === "editor") ?? null;
  const terminals = launchers?.filter((launcher) => launcher.kind === "terminal") ?? null;

  return (
    <>
      <p className="mb-4 text-xs leading-5 text-mist-500">
        Choose which installed application opens when launching a project or terminal.
      </p>
      <SettingsGroup>
        <LauncherChoice
          label="Editor"
          hint="Left automatic, the editor built for the project's language leads, then any general-purpose one."
          empty="No editor was found in your Applications folder."
          launchers={editors}
          chosen={settings.preferredEditor}
          onChoose={(preferredEditor) => updateSettings({ preferredEditor })}
        />
        <LauncherChoice
          label="Terminal"
          hint="No platform exposes a default terminal an app opening a directory could read, so automatic is whichever was found first."
          empty="No terminal was found."
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
  const detecting = launchers === null;
  const none = !detecting && launchers.length === 0;
  const uninstalled =
    launchers !== null &&
    !none &&
    chosen !== null &&
    !launchers.some((launcher) => launcher.id === chosen);

  const options = [
    { value: "", label: "Automatic" },
    ...(launchers ?? []).map((launcher) => ({ value: launcher.id, label: launcher.name })),
    ...(uninstalled ? [{ value: chosen as string, label: "Not installed" }] : []),
  ];

  return (
    <div className="flex items-center justify-between gap-4 py-4 text-xs text-mist-300">
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-medium text-mist-100">{label}</span>
        <span className="text-xs leading-5 text-mist-500">
          {detecting
            ? "Reading what this machine has installed..."
            : none
              ? empty
              : uninstalled
                ? "The one you chose is no longer installed, so opening falls back to detection."
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
  onClick,
}: {
  icon?: ReactNode;
  label: string;
  hint?: string;
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`group flex w-full items-center justify-between gap-4 py-4 text-left text-xs transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${selected ? "text-mist-100" : "text-mist-500 hover:text-mist-300"
        }`}
    >
      <span className="flex min-w-0 flex-1 items-start gap-3">
        {icon && (
          <span className="mt-0.5 shrink-0 text-mist-500 transition-colors group-hover:text-mist-300">
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
            : "border-forest-750 bg-forest-950/60 group-hover:border-forest-700"
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
  const offered = update.stage === "available" || update.stage === "ready";
  const busy = update.stage === "checking" || update.stage === "downloading";

  return (
    <div className="mt-3 flex flex-col items-center gap-2">
      {update.stage === "available" && (
        <p className="text-xs text-sage-300">Uncached {update.version} is available</p>
      )}
      {update.stage === "downloading" && (
        <p className="text-xs text-mist-500">
          Downloading {update.version}
          {update.progress === null ? "" : ` — ${Math.round(update.progress * 100)}%`}
        </p>
      )}
      {update.stage === "ready" && (
        <p className="text-xs text-sage-300">
          Uncached {update.version} is installed — restart to use it
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
          ? "Checking…"
          : update.stage === "downloading"
            ? "Show progress"
            : update.stage === "available"
              ? "See what's new"
              : update.stage === "ready"
                ? "Restart now"
                : "Check for updates"}
      </button>
    </div>
  );
}
