import { useEffect, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { List, Monitor, Moon, Settings, Share2, Sun, X } from "lucide-react";
import { LicenseSection } from "./LicenseSection";
import { Select } from "../shared/Select";
import { useLaunchers, type Launcher } from "../../hooks/useLaunchers";
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
  proEnabled: boolean;
};

const sections = ["General", "Opening", "Scanning", "Ignore rules", "Deletion", "Appearance", "Licence", "About"] as const;
type Section = (typeof sections)[number];

export function SettingsPanel({ open, onClose, settings, loading, saving, error, updateSettings, onLicenseChange = () => { }, proEnabled }: SettingsPanelProps) {
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
            <Select label="Settings section" value={section} options={sections.map((item) => ({ value: item, label: item }))} onChange={(value) => setSection(value as Section)} className="sm:hidden" />
            <button type="button" onClick={onClose} className="grid size-8 place-items-center rounded-lg bg-forest-800 text-mist-500 hover:text-mist-100" aria-label="Close settings"><X size={17} /></button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-7">
            {section === "Licence" ? <LicenseSection onActivated={onLicenseChange} /> : section === "About" ? <AboutContent appInfo={appInfo} /> : loading || !settings ? <div className="grid h-full place-items-center text-sm text-mist-500">Loading settings...</div> : <SettingsContent section={section} settings={settings} updateSettings={updateSettings} proEnabled={proEnabled} onRequestPermanentDelete={() => setConfirmPermanent(true)} />}
            {error && <p className="select-text mt-5 rounded-xl bg-forest-950 px-4 py-3 text-sm text-coral-300" role="alert">{error}</p>}
          </div>
          <footer className="flex shrink-0 justify-end border-t border-forest-800 px-5 py-3 text-xs text-mist-500 sm:px-7">{saving ? "Saving..." : "Saved automatically"}</footer>
        </div>
      </section>
      {confirmPermanent && <div className="fixed inset-0 z-50 grid place-items-center bg-forest-900/70 backdrop-blur-xs p-5" onClick={(event) => event.stopPropagation()}><div role="dialog" aria-modal="true" className="w-full max-w-sm rounded-3xl border border-forest-800 bg-forest-900 p-6 shadow-2xl"><h2 className="text-xl font-semibold text-mist-100">Enable permanent deletion?</h2><p className="mt-3 text-sm leading-6 text-mist-500">Targets are deleted from disk instead of moved to the Recycle Bin. Not recoverable. Each cleanup then requires typing <strong className="font-mono text-coral-300">Nuke</strong> to confirm.</p><div className="mt-6 flex justify-end gap-3"><button type="button" onClick={() => setConfirmPermanent(false)} className="rounded-xl bg-forest-800 px-4 py-2.5 text-sm text-mist-300 hover:bg-forest-850">Cancel</button><button type="button" onClick={() => { void updateSettings({ defaultCleanMode: "Permanent" }); setConfirmPermanent(false); }} className="rounded-xl bg-coral-300 px-4 py-2.5 text-sm font-semibold text-forest-950 hover:opacity-90">Enable permanent deletion</button></div></div></div>}
    </div>
  );
}

function SettingsContent({ section, settings, updateSettings, proEnabled, onRequestPermanentDelete }: { section: Section; settings: AppSettings; updateSettings: SettingsPanelProps["updateSettings"]; proEnabled: boolean; onRequestPermanentDelete: () => void }) {
  if (section === "General") return <SettingsGroup><SettingToggle label="Open at startup" checked={settings.openAtStartup} onChange={(value) => updateSettings({ openAtStartup: value })} /><SettingToggle label="Keep running in the background" hint="Closing the window hides Uncached in the menu bar instead of quitting it. Scheduled maintenance runs from there; Quit ends it until you open the app again." checked={settings.keepRunningInBackground} onChange={(value) => updateSettings({ keepRunningInBackground: value })} /><SettingToggle label="Remember last workspace" checked={settings.rememberLastWorkspace} onChange={(value) => updateSettings({ rememberLastWorkspace: value })} /><SettingToggle label="Check for updates" checked={settings.checkForUpdates} onChange={(value) => updateSettings({ checkForUpdates: value })} /></SettingsGroup>;
  if (section === "Opening") return <OpeningContent settings={settings} updateSettings={updateSettings} />;
  if (section === "Scanning") return <ScanningContent settings={settings} updateSettings={updateSettings} />;
  if (section === "Ignore rules") return <IgnoreRulesContent settings={settings} updateSettings={updateSettings} />;
  if (section === "Deletion") return <SettingsGroup><SettingRadio label="Move to Recycle Bin" selected={settings.defaultCleanMode === "Trash"} onClick={() => updateSettings({ defaultCleanMode: "Trash" })} /><SettingRadio label="Permanently delete" selected={settings.defaultCleanMode === "Permanent"} onClick={onRequestPermanentDelete} /></SettingsGroup>;
  return <AppearanceContent settings={settings} updateSettings={updateSettings} proEnabled={proEnabled} />;
}

/**
 * Theme, and which reading of the workspace opens.
 *
 * The view used to be a pair of buttons in the workspace header — a decision
 * offered on every visit, for a question answered once, whose answer did not
 * survive the window closing. It belongs here, where a preference is kept.
 */
function AppearanceContent({ settings, updateSettings, proEnabled }: { settings: AppSettings; updateSettings: SettingsPanelProps["updateSettings"]; proEnabled: boolean }) {
  return (
    <div className="grid gap-7">
      <div>
        <SettingsLabel>Theme</SettingsLabel>
        <SettingsGroup>
          <SettingRadio icon={<Moon size={16} />} label="Dark" selected={settings.appearance === "dark"} onClick={() => updateSettings({ appearance: "dark" as Appearance })} />
          <SettingRadio icon={<Sun size={16} />} label="Light" selected={settings.appearance === "light"} onClick={() => updateSettings({ appearance: "light" as Appearance })} />
          <SettingRadio icon={<Monitor size={16} />} label="System" selected={settings.appearance === "system"} onClick={() => updateSettings({ appearance: "system" as Appearance })} />
        </SettingsGroup>
      </div>

      <div>
        <SettingsLabel>Workspace opens as</SettingsLabel>
        <SettingsGroup>
          <SettingRadio
            icon={<List size={16} />}
            label="List"
            hint="Every project, grouped or ranked, and the only view reachable by keyboard."
            selected={!proEnabled || settings.workspaceView === "list"}
            onClick={() => updateSettings({ workspaceView: "list" })}
          />
          <SettingRadio
            icon={<Share2 size={16} />}
            label="Map"
            hint={proEnabled
              ? "The same workspace as one picture: what each project weighs, and which packages more than one of them carries."
              : "Pro. A workspace too large to draw opens as a list whichever is chosen here."}
            selected={proEnabled && settings.workspaceView === "map"}
            disabled={!proEnabled}
            onClick={() => updateSettings({ workspaceView: "map" })}
          />
        </SettingsGroup>
      </div>
    </div>
  );
}

function SettingsLabel({ children }: { children: ReactNode }) {
  return <p className="pb-1 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-mist-500">{children}</p>;
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

/**
 * Which application a project opens in.
 *
 * Chosen from what was found rather than typed, which is the difference that
 * matters: the original note against a setting here was about asking someone to
 * spell the name of their editor, and this asks nothing of the kind.
 *
 * It exists because there is nothing to infer from. macOS has no
 * default-terminal setting at all, and no platform has a default *editor* in
 * any sense an app that opens a directory could read — so without this the
 * order in a table decides, which is a guess.
 */
function OpeningContent({ settings, updateSettings }: { settings: AppSettings; updateSettings: SettingsPanelProps["updateSettings"] }) {
  const launchers = useLaunchers();
  const editors = launchers?.filter((launcher) => launcher.kind === "editor") ?? null;
  const terminals = launchers?.filter((launcher) => launcher.kind === "terminal") ?? null;

  return (
    <SettingsGroup>
      <LauncherChoice
        label="Editor"
        /* Automatic is not "the first one alphabetically": a specialist opens
           the language it is built for and otherwise sorts below every
           general-purpose editor, which is what keeps Xcode from leading a
           React project on a Mac that has little else. */
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
  );
}

/**
 * A list of applications is a list, not a set of alternatives to weigh: on a
 * developer's machine it runs to a dozen editors, and a dozen radio buttons
 * push everything else off the panel. It collapses to the one line that
 * matters — what opens a project today.
 */
function LauncherChoice({ label, hint, empty, launchers, chosen, onChoose }: { label: string; hint: string; empty: string; launchers: Launcher[] | null; chosen: string | null; onChoose: (id: string | null) => void }) {
  const detecting = launchers === null;
  const none = !detecting && launchers.length === 0;
  // A preference outlives the application it names. Opening already falls back
  // to detection when that happens; saying so is the difference between a
  // setting that is being ignored and one that appears never to have been made.
  const uninstalled = launchers !== null && !none && chosen !== null && !launchers.some((launcher) => launcher.id === chosen);

  const options = [
    { value: "", label: "Automatic" },
    ...(launchers ?? []).map((launcher) => ({ value: launcher.id, label: launcher.name })),
    ...(uninstalled ? [{ value: chosen as string, label: "Not installed" }] : []),
  ];

  return (
    <div className="flex items-center justify-between gap-4 py-4 text-sm text-mist-300">
      <span className="flex min-w-0 flex-col gap-0.5">
        <span>{label}</span>
        <span className="text-xs leading-5 text-mist-500">
          {detecting ? "Reading what this machine has installed..." : none ? empty : uninstalled ? "The one you chose is no longer installed, so opening falls back to detection." : hint}
        </span>
      </span>
      <Select
        label={label}
        value={chosen ?? ""}
        options={options}
        disabled={detecting || none}
        onChange={(value) => onChoose(value === "" ? null : value)}
        className="w-44 shrink-0"
      />
    </div>
  );
}

function SettingsGroup({ children }: { children: ReactNode }) { return <div className="divide-y divide-forest-800">{children}</div>; }
function SettingToggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (value: boolean) => void }) { return <label className="flex cursor-pointer items-center justify-between gap-4 py-4 text-sm text-mist-300"><span className="flex flex-col gap-0.5"><span>{label}</span>{hint && <span className="text-xs leading-5 text-mist-500">{hint}</span>}</span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="size-4 shrink-0 accent-sage-400" /></label>; }
function SettingRadio({ icon, label, hint, selected, disabled = false, onClick }: { icon?: ReactNode; label: string; hint?: string; selected: boolean; disabled?: boolean; onClick: () => void }) { return <button type="button" disabled={disabled} onClick={onClick} className={`flex w-full items-center justify-between gap-4 py-4 text-left text-sm disabled:cursor-not-allowed disabled:opacity-60 ${selected ? "text-mist-100" : "text-mist-500"}`}><span className="flex items-start gap-3">{icon && <span className="mt-0.5 shrink-0">{icon}</span>}<span className="flex flex-col gap-0.5"><span>{label}</span>{hint && <span className="text-xs leading-5 text-mist-500">{hint}</span>}</span></span><span className={`mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border ${selected ? "border-sage-400 bg-sage-400" : "border-forest-800"}`}>{selected && <span className="size-1.5 rounded-full bg-forest-950" />}</span></button>; }
