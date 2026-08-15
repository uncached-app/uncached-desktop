import { useCallback, useEffect, useState, type ReactNode } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { CommandPalette } from "../components/shared/CommandPalette";
import { CommandPaletteContext } from "../hooks/useCommandPalette";
import { Footer } from "../components/layout/Footer";
import { ModuleBar } from "../components/layout/ModuleBar";
import { Screen } from "../components/layout/Screen";
import { Titlebar } from "../components/layout/Titlebar";
import { SettingsPanel } from "../components/settings/SettingsPanel";
import { usePurgeFlow } from "../hooks/usePurgeFlow";
import { useWindowFill } from "../hooks/useWindowFill";
import type { useSettings } from "../hooks/useSettings";
import type { AppModule } from "../types/module";
import type { WorkspaceProject } from "../types/workspace";

type AppLayoutProps = {
  activeModule: AppModule;
  onModuleChange: (module: AppModule) => void;
  settings: ReturnType<typeof useSettings>;
  settingsOpen: boolean;
  onSettingsOpenChange: (open: boolean) => void;
  /** Re-reads the plan after an activation, which is native state. */
  onLicenseChange?: () => void;
  proEnabled: boolean;
  align?: "center" | "start";
  children: ReactNode;
};

/** The window chrome every module renders inside: titlebar, frame, module bar. */
export function AppLayout({
  activeModule,
  onModuleChange,
  settings,
  settingsOpen,
  onSettingsOpenChange,
  onLicenseChange,
  proEnabled,
  align = "start",
  children,
}: AppLayoutProps) {
  const isMac = /Macintosh|Mac OS X/.test(navigator.userAgent);
  const { step, view, listenersReady } = usePurgeFlow();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteProject, setPaletteProject] = useState<WorkspaceProject | null>(null);
  useSplashScreen(!settings.loading && listenersReady);
  useWindowFill();
  // Stable, because it is handed to every screen through a context.
  const openPalette = useCallback((project?: WorkspaceProject) => {
    setPaletteProject(project ?? null);
    setPaletteOpen(true);
  }, []);
  // The shortcut always opens at the top. Reopening onto whichever project was
  // last clicked would put the user somewhere they did not ask to be.
  const togglePalette = useCallback(() => {
    setPaletteProject(null);
    setPaletteOpen((open) => !open);
  }, []);
  useCommandPaletteShortcut(togglePalette);

  return (
    // `h-full`, not `h-screen`: the viewport is the whole window and the app
    // only occupies what is left inside the shadow gutter.
    <main className="relative flex h-full flex-col overflow-hidden rounded-[18px] bg-forest-950 text-mist-100">
      <Titlebar step={step} view={view} activeModule={activeModule} onOpenSettings={() => onSettingsOpenChange(true)} />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="mx-auto flex min-h-0 w-full max-w-[72rem] flex-1 flex-col overflow-hidden">
          <CommandPaletteContext.Provider value={openPalette}>
            <Screen align={align}>{children}</Screen>
          </CommandPaletteContext.Provider>
          {!isMac && activeModule === "reclaim" && <Footer onOpenSettings={() => onSettingsOpenChange(true)} />}
        </div>
        <ModuleBar activeModule={activeModule} onChange={onModuleChange} proEnabled={proEnabled} />
      </div>
      <SettingsPanel open={settingsOpen} onClose={() => onSettingsOpenChange(false)} onLicenseChange={onLicenseChange} proEnabled={proEnabled} {...settings} />
      <CommandPalette
        open={paletteOpen}
        project={paletteProject}
        onClose={() => setPaletteOpen(false)}
        onModuleChange={onModuleChange}
        onOpenSettings={() => onSettingsOpenChange(true)}
      />
    </main>
  );
}

/**
 * The one shortcut the whole app answers to.
 *
 * Bound on the window rather than inside the palette, because the point is
 * reaching it from anywhere — including from a screen that has its own
 * keyboard handling. It toggles: the same keys that opened it close it, which
 * is what the hand expects when it is already on them.
 */
function useCommandPaletteShortcut(toggle: () => void) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "k" || !(event.metaKey || event.ctrlKey)) return;
      event.preventDefault();
      toggle();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggle]);
}

/** Reveals the window and dismisses the splash once the app can be used. */
function useSplashScreen(ready: boolean) {
  useEffect(() => {
    if (!ready) return;
    if (isTauri()) {
      // The window is created hidden and revealed here. A launch that came from
      // the login item stays hidden: the tray icon is how it is opened, and a
      // window nobody asked for is the reason people disable startup items.
      void invoke<boolean>("starts_hidden")
        .catch(() => false)
        .then((hidden) => {
          if (hidden) return;
          const appWindow = getCurrentWindow();
          void appWindow.show();
          void appWindow.setFocus();
        });
    }
    const splash = document.getElementById("app-splashscreen");
    if (!splash) return;
    splash.classList.add("splash-fade-out");
    const timer = setTimeout(() => splash.remove(), 300);
    return () => clearTimeout(timer);
  }, [ready]);
}
