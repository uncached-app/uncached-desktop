import { useEffect, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Monitor, Moon, Settings, Sun, X } from "lucide-react";
import { LicenseSection } from "./LicenseSection";
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
};

const sections = ["General", "Scanning", "Ignore rules", "Deletion", "Appearance", "Licence", "About"] as const;
type Section = (typeof sections)[number];

export function SettingsPanel({ open, onClose, settings, loading, saving, error, updateSettings, onLicenseChange = () => { } }: SettingsPanelProps) {
  const [section, setSection] = useState<Section>("General");
  const [appInfo, setAppInfo] = useState<{ name: string; version: string; website: string } | null>(null);
  const [confirmPermanent, setConfirmPermanent] = useState(false);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  useEffect(() => {
    if (open) void invoke<{ name: string; version: string; website: string }>("get_app_info").then(setAppInfo);
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-transparent p-4 backdrop-blur-xs" onClick={onClose}>
      <section role="dialog" aria-modal="true" aria-label="Settings" onClick={(event) => event.stopPropagation()} className="flex h-[min(680px,calc(100vh-32px))] w-full max-w-3xl overflow-hidden rounded-3xl border border-forest-800 bg-forest-900 shadow-2xl">
        <aside className="hidden w-52 shrink-0 border-r border-forest-800 bg-forest-950 p-4 sm:block">
          <div className="flex items-center gap-2 px-2 py-3 text-sm font-medium text-mist-100"><Settings size={16} className="text-sage-300" /> Settings</div>
          <nav className="mt-5 space-y-1" aria-label="Settings sections">
            {sections.map((item) => <button key={item} type="button" onClick={() => setSection(item)} className={`flex w-full items-center rounded-xl px-3 py-2.5 text-left text-sm transition-colors ${section === item ? "bg-forest-800 text-mist-100" : "text-mist-500 hover:bg-forest-900 hover:text-mist-300"}`}>{item}</button>)}
          </nav>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex shrink-0 items-center justify-between border-b border-forest-800 px-5 py-4 sm:px-7">
            <div className="flex items-center gap-3 sm:hidden"><Settings size={16} className="text-sage-300" /><span className="text-sm font-medium text-mist-100">Settings</span></div>
            <h2 className="hidden text-lg font-semibold text-mist-100 sm:block">{section}</h2>
            <select value={section} onChange={(event) => setSection(event.target.value as Section)} className="rounded-lg bg-forest-800 px-2 py-1.5 text-sm text-mist-100 sm:hidden">{sections.map((item) => <option key={item}>{item}</option>)}</select>
            <button type="button" onClick={onClose} className="grid size-8 place-items-center rounded-lg bg-forest-800 text-mist-500 hover:text-mist-100" aria-label="Close settings"><X size={17} /></button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-7">
            {section === "Licence" ? <LicenseSection onActivated={onLicenseChange} /> : section === "About" ? <AboutContent appInfo={appInfo} /> : loading || !settings ? <div className="grid h-full place-items-center text-sm text-mist-500">Loading settings...</div> : <SettingsContent section={section} settings={settings} updateSettings={updateSettings} onRequestPermanentDelete={() => setConfirmPermanent(true)} />}
            {error && <p className="mt-5 rounded-xl bg-forest-950 px-4 py-3 text-sm text-coral-300" role="alert">{error}</p>}
          </div>
          <footer className="flex shrink-0 justify-end border-t border-forest-800 px-5 py-3 text-xs text-mist-500 sm:px-7">{saving ? "Saving..." : "Saved automatically"}</footer>
        </div>
      </section>
      {confirmPermanent && <div className="fixed inset-0 z-50 grid place-items-center bg-forest-900/70 backdrop-blur-xs p-5" onClick={(event) => event.stopPropagation()}><div role="dialog" aria-modal="true" className="w-full max-w-sm rounded-3xl border border-forest-800 bg-forest-900 p-6 shadow-2xl"><h2 className="text-xl font-semibold text-mist-100">Enable permanent deletion?</h2><p className="mt-3 text-sm leading-6 text-mist-500">Targets are deleted from disk instead of moved to the Recycle Bin. Not recoverable. Each cleanup then requires typing <strong className="font-mono text-coral-300">Nuke</strong> to confirm.</p><div className="mt-6 flex justify-end gap-3"><button type="button" onClick={() => setConfirmPermanent(false)} className="rounded-xl bg-forest-800 px-4 py-2.5 text-sm text-mist-300 hover:bg-forest-850">Cancel</button><button type="button" onClick={() => { void updateSettings({ defaultCleanMode: "Permanent" }); setConfirmPermanent(false); }} className="rounded-xl bg-coral-300 px-4 py-2.5 text-sm font-semibold text-forest-950 hover:opacity-90">Enable permanent deletion</button></div></div></div>}
    </div>
  );
}

function SettingsContent({ section, settings, updateSettings, onRequestPermanentDelete }: { section: Section; settings: AppSettings; updateSettings: SettingsPanelProps["updateSettings"]; onRequestPermanentDelete: () => void }) {
  if (section === "General") return <SettingsGroup><SettingToggle label="Open at startup" checked={settings.openAtStartup} onChange={(value) => updateSettings({ openAtStartup: value })} /><SettingToggle label="Keep running in the background" checked={settings.keepRunningInBackground} onChange={(value) => updateSettings({ keepRunningInBackground: value })} /><SettingToggle label="Remember last workspace" checked={settings.rememberLastWorkspace} onChange={(value) => updateSettings({ rememberLastWorkspace: value })} /><SettingToggle label="Check for updates" checked={settings.checkForUpdates} onChange={(value) => updateSettings({ checkForUpdates: value })} /></SettingsGroup>;
  if (section === "Scanning") return <ScanningContent settings={settings} updateSettings={updateSettings} />;
  if (section === "Ignore rules") return <IgnoreRulesContent settings={settings} updateSettings={updateSettings} />;
  if (section === "Deletion") return <SettingsGroup><SettingRadio label="Move to Recycle Bin" selected={settings.defaultCleanMode === "Trash"} onClick={() => updateSettings({ defaultCleanMode: "Trash" })} /><SettingRadio label="Permanently delete" selected={settings.defaultCleanMode === "Permanent"} onClick={onRequestPermanentDelete} /></SettingsGroup>;
  return <SettingsGroup><SettingRadio icon={<Moon size={16} />} label="Dark" selected={settings.appearance === "dark"} onClick={() => updateSettings({ appearance: "dark" as Appearance })} /><SettingRadio icon={<Sun size={16} />} label="Light" selected={settings.appearance === "light"} onClick={() => updateSettings({ appearance: "light" as Appearance })} /><SettingRadio icon={<Monitor size={16} />} label="System" selected={settings.appearance === "system"} onClick={() => updateSettings({ appearance: "system" as Appearance })} /></SettingsGroup>;
}

function AboutContent({ appInfo }: { appInfo: { name: string; version: string; website: string } | null }) {
  const websiteUrl = appInfo?.website ?? "https://uncached.app";
  const eulaUrl = "https://uncached.app/eula";

  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <img src="/brand/UNCACHED-ICON-LIGHT-BGDARK.svg" alt="" className="theme-logo-light size-20" />
      <img src="/brand/UNCACHED-ICON-DARK-NOBG.svg" alt="" className="theme-logo-dark size-20" />
      <h3 className="mt-6 text-2xl font-semibold text-mist-100">{appInfo?.name ?? "Uncached"}</h3>
      <p className="mt-2 text-sm text-mist-500">Reclaim disk from build artifacts.</p>
      <p className="mt-6 font-mono text-xs text-mist-500">Version {appInfo?.version ?? "..."}</p>
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

/**
 * The one screen where the user overrules the product.
 *
 * Edits are held locally and saved on blur rather than on every keystroke:
 * a half-typed path is a rule that matches nothing, and persisting it would
 * make the scan behave differently mid-sentence.
 *
 * Rules are validated in Rust as they are typed, because the alternative —
 * dropping a line that failed to compile — leaves the user believing something
 * is protected when it is not.
 */
function IgnoreRulesContent({ settings, updateSettings }: { settings: AppSettings; updateSettings: SettingsPanelProps["updateSettings"] }) {
  const [draft, setDraft] = useState(settings.ignoreRules);
  const [review, setReview] = useState<IgnoreRuleReview | null>(null);

  useEffect(() => { setDraft(settings.ignoreRules); }, [settings.ignoreRules]);

  useEffect(() => {
    let current = true;
    void invoke<IgnoreRuleReview>("review_ignore_rules", { text: draft })
      .then((result) => { if (current) setReview(result); })
      .catch(() => { if (current) setReview(null); });
    return () => { current = false; };
  }, [draft]);

  const problemLines = new Set((review?.problems ?? []).map((problem) => problem.line));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <p className="text-sm leading-6 text-mist-500">
        Paths listed here are never scanned and never deleted, whatever the app finds there.
        One rule per line, in <span className="font-mono text-mist-300">.gitignore</span> syntax —
        a bare name matches anywhere, a full path matches that path and everything under it,
        and <span className="font-mono text-mist-300">!</span> makes an exception.
      </p>

      <textarea
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => { if (draft !== settings.ignoreRules) void updateSettings({ ignoreRules: draft }); }}
        spellCheck={false}
        placeholder={IGNORE_RULES_PLACEHOLDER}
        aria-label="Ignore rules"
        aria-invalid={problemLines.size > 0}
        className="mt-5 min-h-44 flex-1 resize-none rounded-2xl border border-forest-800 bg-forest-950 p-4 font-mono text-xs leading-6 placeholder:text-mist-500/60 focus:outline-none"
      />

      <div className="mt-4 shrink-0 space-y-2" aria-live="polite">
        {review && review.problems.length > 0 && review.problems.map((problem) => (
          <p key={problem.line} className="rounded-xl bg-confidence-review-surface px-4 py-2.5 text-xs leading-5 text-confidence-review">
            {/* Naming the line and quoting it back is what makes this fixable:
                the rule stays in the list, it just does not protect anything yet. */}
            <span className="font-semibold">Line {problem.line}</span> could not be read, so it protects nothing:{" "}
            <span className="font-mono">{problem.text.trim()}</span> — {problem.reason}
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

/**
 * What the scan looks at outside the chosen folders.
 *
 * Inside a workspace there is nothing to switch: an ignore rule already says
 * "never touch anything called this, anywhere", reaches every category rather
 * than the five that used to have toggles, and wins against the provider, the
 * confidence and a schedule. A switch beside it would be a weaker duplicate.
 *
 * These have no such equivalent. They live under paths nobody chose, belong to
 * tools rather than to projects, and each costs something different to lose.
 */
function ScanningContent({ settings, updateSettings }: { settings: AppSettings; updateSettings: SettingsPanelProps["updateSettings"] }) {
  return (
    <>
      <p className="mb-5 text-sm leading-6 text-mist-500">
        Build artifacts inside your folders are always detected. These are the caches that live
        elsewhere, written by tools rather than by a project.
      </p>
      <SettingsGroup>
        <SettingToggle
          label="Package manager caches"
          checked={settings.detectPackageManagerCaches}
          onChange={(value) => updateSettings({ detectPackageManagerCaches: value })}
        />
        <SettingToggle
          label="AI tool caches"
          checked={settings.detectAiToolCaches}
          onChange={(value) => updateSettings({ detectAiToolCaches: value })}
        />
        <SettingToggle
          label="Editor caches"
          checked={settings.detectEditorCaches}
          onChange={(value) => updateSettings({ detectEditorCaches: value })}
        />
      </SettingsGroup>
      <p className="mt-5 text-xs leading-5 text-mist-500">
        To leave something inside a workspace alone, add it under Ignore rules — a rule there covers
        every kind of artifact and applies to scheduled runs too.
      </p>
    </>
  );
}

function SettingsGroup({ children }: { children: ReactNode }) { return <div className="divide-y divide-forest-800">{children}</div>; }
function SettingToggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) { return <label className="flex cursor-pointer items-center justify-between gap-4 py-4 text-sm text-mist-300"><span>{label}</span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="size-4 accent-sage-400" /></label>; }
function SettingRadio({ icon, label, selected, onClick }: { icon?: ReactNode; label: string; selected: boolean; onClick: () => void }) { return <button type="button" onClick={onClick} className={`flex w-full items-center justify-between gap-4 py-4 text-left text-sm ${selected ? "text-mist-100" : "text-mist-500"}`}><span className="flex items-center gap-3">{icon}<span>{label}</span></span><span className={`grid size-4 place-items-center rounded-full border ${selected ? "border-sage-400 bg-sage-400" : "border-forest-800"}`}>{selected && <span className="size-1.5 rounded-full bg-forest-950" />}</span></button>; }
