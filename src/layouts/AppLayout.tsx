import { useEffect, type ReactNode } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Footer } from "../components/layout/Footer";
import { ModuleBar } from "../components/layout/ModuleBar";
import { Screen } from "../components/layout/Screen";
import { Titlebar } from "../components/layout/Titlebar";
import { SettingsPanel } from "../components/settings/SettingsPanel";
import { usePurgeFlow } from "../hooks/usePurgeFlow";
import type { useSettings } from "../hooks/useSettings";
import type { AppModule } from "../types/module";

type AppLayoutProps = {
  activeModule: AppModule;
  onModuleChange: (module: AppModule) => void;
  settings: ReturnType<typeof useSettings>;
  settingsOpen: boolean;
  onSettingsOpenChange: (open: boolean) => void;
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
  align = "start",
  children,
}: AppLayoutProps) {
  const isMac = /Macintosh|Mac OS X/.test(navigator.userAgent);
  const { step, listenersReady } = usePurgeFlow();
  useSplashScreen(!settings.loading && listenersReady);

  return (
    <main className="relative flex h-screen flex-col overflow-hidden rounded-[18px] bg-forest-950 text-mist-100">
      <Titlebar step={step} activeModule={activeModule} onOpenSettings={() => onSettingsOpenChange(true)} />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="mx-auto flex min-h-0 w-full max-w-screen flex-1 flex-col overflow-hidden">
          <Screen align={align}>{children}</Screen>
          {!isMac && activeModule === "reclaim" && <Footer onOpenSettings={() => onSettingsOpenChange(true)} />}
        </div>
        <ModuleBar activeModule={activeModule} onChange={onModuleChange} />
      </div>
      <SettingsPanel open={settingsOpen} onClose={() => onSettingsOpenChange(false)} {...settings} />
    </main>
  );
}

/** Reveals the window and dismisses the splash once the app can be used. */
function useSplashScreen(ready: boolean) {
  useEffect(() => {
    if (!ready) return;
    if (isTauri()) {
      const appWindow = getCurrentWindow();
      void appWindow.show();
      void appWindow.setFocus();
    }
    const splash = document.getElementById("app-splashscreen");
    if (!splash) return;
    splash.classList.add("splash-fade-out");
    const timer = setTimeout(() => splash.remove(), 300);
    return () => clearTimeout(timer);
  }, [ready]);
}
