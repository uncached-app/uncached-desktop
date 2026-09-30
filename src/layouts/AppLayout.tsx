import { useCallback, useEffect, useState, type ReactNode } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { CommandPalette } from "../components/shared/CommandPalette";
import { CommandPaletteContext } from "../hooks/useCommandPalette";
import { ModuleBar } from "../components/layout/ModuleBar";
import { ResizeHandles } from "../components/layout/ResizeHandles";
import { Screen } from "../components/layout/Screen";
import { Titlebar } from "../components/layout/Titlebar";
import { SettingsPanel } from "../components/settings/SettingsPanel";
import { usePurgeFlow } from "../hooks/usePurgeFlow";
import { useUpdate } from "../hooks/useUpdate";
import { UpdateToast } from "../components/layout/UpdateToast";
import { UpdateDialog } from "../components/layout/UpdateDialog";
import { useNativeMenu } from "../hooks/useNativeMenu";
import { useShortcuts } from "../hooks/useShortcuts";
import { useTraySummary } from "../hooks/useTraySummary";
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
  const flow = usePurgeFlow();
  const { step, view, listenersReady } = flow;
  // Gated on the same signal the workspace watcher refuses on. Replacing the
  // binary under a running cleanup is the one way this feature could break
  // something that matters.
  const busy = flow.scanning || flow.cleaningTargetIds.size > 0;
  const update = useUpdate({ busy });
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteProject, setPaletteProject] = useState<WorkspaceProject | null>(null);
  // Every route to an update ends here — the badge, the toast, and About — so
  // there is one layout for reading release notes instead of three.
  const [updateOpen, setUpdateOpen] = useState(false);
  useSplashScreen(!settings.loading && listenersReady);
  useWindowFill();
  useTraySummary(flow.footprints, flow.measuring);
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


  // The global half of the registry. The workspace claims the rest, because a
  // screen owns the verbs that only mean something on it — and a listener with
  // no handler for the key it matched stands aside for the one that has it.
  const bindings = useShortcuts(
    {
      palette: togglePalette,
      settings: () => onSettingsOpenChange(true),
      workspace: () => onModuleChange("reclaim"),
      maintenance: () => onModuleChange("intelligence"),
      insights: () => onModuleChange("insights"),
    },
    settings.settings?.shortcuts,
  );

  useNativeMenu(bindings);

  return (
    // `h-full`, not `h-screen`: the viewport is the whole window and the app
    // only occupies what is left inside the shadow gutter.
    <main className="relative flex h-full flex-col overflow-hidden rounded-[18px] bg-forest-950 text-mist-100">
      <Titlebar step={step} view={view} activeModule={activeModule} onOpenSettings={() => onSettingsOpenChange(true)} update={update} onOpenUpdate={() => setUpdateOpen(true)} />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {/* A column, until the window is filled.
            
            Seventy-two rem is a reading width, and it is the right one for a
            floating window: a list of projects set across a wide desktop is a
            line your eye has to travel. Filling the screen is a request for
            room, though — the map is the reason anyone does it — so the limit
            lifts with the same attribute that closes the shadow gutter, rather
            than with a second idea of what "full size" means. */}
        <div className="mx-auto flex min-h-0 w-full max-w-[72rem] flex-1 flex-col overflow-hidden root-filled:max-w-none">
          <CommandPaletteContext.Provider value={openPalette}>
            <Screen align={align}>{children}</Screen>
          </CommandPaletteContext.Provider>
        </div>
        <ModuleBar
          activeModule={activeModule}
          onChange={onModuleChange}
          proEnabled={proEnabled}
          view={view}
          onViewChange={flow.setView}
          onOpenSettings={isMac ? undefined : () => onSettingsOpenChange(true)}
        />
      </div>
      <ResizeHandles />
      <UpdateToast update={update} busy={busy} onOpenUpdate={() => setUpdateOpen(true)} />
      <UpdateDialog update={update} open={updateOpen} onClose={() => setUpdateOpen(false)} />

      <SettingsPanel open={settingsOpen} onClose={() => onSettingsOpenChange(false)} onLicenseChange={onLicenseChange} proEnabled={proEnabled} update={update} onOpenUpdate={() => setUpdateOpen(true)} {...settings} />
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
