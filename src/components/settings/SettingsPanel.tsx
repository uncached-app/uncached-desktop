import { useEffect, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Monitor, Moon, Settings, Sun, X } from "lucide-react";
import type { AppSettings, Appearance } from "../../types/settings";

type SettingsPanelProps = {
  open: boolean;
  onClose: () => void;
  settings: AppSettings | null;
  loading: boolean;
  saving: boolean;
  error: string | null;
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>;
};

const sections = ["General", "Scanning", "Deletion", "Appearance", "About"] as const;
type Section = (typeof sections)[number];

export function SettingsPanel({ open, onClose, settings, loading, saving, error, updateSettings }: SettingsPanelProps) {
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
            <select value={section} onChange={(event) => setSection(event.target.value as Section)} className="rounded-lg bg-forest-800 px-2 py-1.5 text-sm text-mist-200 sm:hidden"><option>General</option><option>Scanning</option><option>Deletion</option><option>Appearance</option><option>About</option></select>
            <button type="button" onClick={onClose} className="grid size-8 place-items-center rounded-lg bg-forest-800 text-mist-500 hover:text-mist-100" aria-label="Close settings"><X size={17} /></button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-7">
            {section === "About" ? <AboutContent appInfo={appInfo} /> : loading || !settings ? <div className="grid h-full place-items-center text-sm text-mist-500">Loading settings...</div> : <SettingsContent section={section} settings={settings} updateSettings={updateSettings} onRequestPermanentDelete={() => setConfirmPermanent(true)} />}
            {error && <p className="mt-5 rounded-xl bg-forest-950 px-4 py-3 text-sm text-coral-300" role="alert">{error}</p>}
          </div>
          <footer className="flex shrink-0 justify-end border-t border-forest-800 px-5 py-3 text-xs text-mist-500 sm:px-7">{saving ? "Saving..." : "Saved automatically"}</footer>
        </div>
      </section>
      {confirmPermanent && <div className="fixed inset-0 z-50 grid place-items-center bg-forest-900/70 backdrop-blur-xs p-5" onClick={(event) => event.stopPropagation()}><div role="dialog" aria-modal="true" className="w-full max-w-sm rounded-3xl border border-forest-800 bg-forest-900 p-6 shadow-2xl"><h2 className="text-xl font-semibold text-mist-100">Enable permanent deletion?</h2><p className="mt-3 text-sm leading-6 text-mist-500">Targets are deleted from disk instead of moved to the Recycle Bin. Not recoverable. Each cleanup then requires typing <strong className="font-mono text-coral-200">Nuke</strong> to confirm.</p><div className="mt-6 flex justify-end gap-3"><button type="button" onClick={() => setConfirmPermanent(false)} className="rounded-xl bg-forest-800 px-4 py-2.5 text-sm text-mist-300 hover:bg-forest-850">Cancel</button><button type="button" onClick={() => { void updateSettings({ defaultCleanMode: "Permanent" }); setConfirmPermanent(false); }} className="rounded-xl bg-coral-300 px-4 py-2.5 text-sm font-semibold text-forest-950 hover:bg-coral-200">Enable permanent deletion</button></div></div></div>}
    </div>
  );
}

function SettingsContent({ section, settings, updateSettings, onRequestPermanentDelete }: { section: Section; settings: AppSettings; updateSettings: SettingsPanelProps["updateSettings"]; onRequestPermanentDelete: () => void }) {
  if (section === "General") return <SettingsGroup><SettingToggle label="Open at startup" checked={settings.openAtStartup} onChange={(value) => updateSettings({ openAtStartup: value })} /><SettingToggle label="Remember last workspace" checked={settings.rememberLastWorkspace} onChange={(value) => updateSettings({ rememberLastWorkspace: value })} /><SettingToggle label="Check for updates" checked={settings.checkForUpdates} onChange={(value) => updateSettings({ checkForUpdates: value })} /></SettingsGroup>;
  if (section === "Scanning") return <SettingsGroup><SettingToggle label="Detect node_modules" checked={settings.detectNodeModules} onChange={(value) => updateSettings({ detectNodeModules: value })} /><SettingToggle label="Detect Cargo target" checked={settings.detectCargoTarget} onChange={(value) => updateSettings({ detectCargoTarget: value })} /><SettingToggle label="Detect Gradle cache" checked={settings.detectGradleCache} onChange={(value) => updateSettings({ detectGradleCache: value })} /><SettingToggle label="Detect Next.js cache" checked={settings.detectNextCache} onChange={(value) => updateSettings({ detectNextCache: value })} /><SettingToggle label="Detect Turbo cache" checked={settings.detectTurboCache} onChange={(value) => updateSettings({ detectTurboCache: value })} /></SettingsGroup>;
  if (section === "Deletion") return <SettingsGroup><SettingRadio label="Move to Recycle Bin" selected={settings.defaultCleanMode === "Trash"} onClick={() => updateSettings({ defaultCleanMode: "Trash" })} /><SettingRadio label="Permanently delete" selected={settings.defaultCleanMode === "Permanent"} onClick={onRequestPermanentDelete} /></SettingsGroup>;
  return <SettingsGroup><SettingRadio icon={<Moon size={16} />} label="Dark" selected={settings.appearance === "dark"} onClick={() => updateSettings({ appearance: "dark" as Appearance })} /><SettingRadio icon={<Sun size={16} />} label="Light" selected={settings.appearance === "light"} onClick={() => updateSettings({ appearance: "light" as Appearance })} /><SettingRadio icon={<Monitor size={16} />} label="System" selected={settings.appearance === "system"} onClick={() => updateSettings({ appearance: "system" as Appearance })} /></SettingsGroup>;
}

function AboutContent({ appInfo }: { appInfo: { name: string; version: string; website: string } | null }) {
  return <div className="flex h-full flex-col items-center justify-center text-center"><img src="/brand/UNCACHED-ICON-LIGHT-BGDARK.svg" alt="" className="theme-logo-light size-20" /><img src="/brand/UNCACHED-ICON-DARK-NOBG.svg" alt="" className="theme-logo-dark size-20" /><h3 className="mt-6 text-2xl font-semibold text-mist-100">{appInfo?.name ?? "Uncached"}</h3><p className="mt-2 text-sm text-mist-500">Reclaim disk from build artifacts.</p><p className="mt-6 font-mono text-xs text-mist-500">Version {appInfo?.version ?? "..."}</p><a href={appInfo?.website ?? "https://uncached.app"} className="mt-5 text-sm text-sage-300 hover:text-sage-200">uncached.app</a></div>;
}

function SettingsGroup({ children }: { children: ReactNode }) { return <div className="divide-y divide-forest-800">{children}</div>; }
function SettingToggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) { return <label className="flex cursor-pointer items-center justify-between gap-4 py-4 text-sm text-mist-300"><span>{label}</span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="size-4 accent-sage-400" /></label>; }
function SettingRadio({ icon, label, selected, onClick }: { icon?: ReactNode; label: string; selected: boolean; onClick: () => void }) { return <button type="button" onClick={onClick} className={`flex w-full items-center justify-between gap-4 py-4 text-left text-sm ${selected ? "text-mist-100" : "text-mist-500"}`}><span className="flex items-center gap-3">{icon}<span>{label}</span></span><span className={`grid size-4 place-items-center rounded-full border ${selected ? "border-sage-400 bg-sage-400" : "border-forest-700"}`}>{selected && <span className="size-1.5 rounded-full bg-forest-950" />}</span></button>; }
