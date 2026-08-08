import { useEffect, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { CompletionView } from "./components/completion/CompletionView";
import { FindingsSection } from "./components/findings/FindingsSection";
import { Footer } from "./components/layout/Footer";
import { Titlebar } from "./components/layout/Titlebar";
import { ScanView } from "./components/scan/ScanView";
import { SettingsPanel } from "./components/settings/SettingsPanel";
import { WorkspaceForm } from "./components/workspace/WorkspaceForm";
import { useScanWorkspace } from "./hooks/useScanWorkspace";
import { useSettings } from "./hooks/useSettings";
import { useTheme } from "./hooks/useTheme";

function App() {
  const settings = useSettings();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const cleanMode = settings.settings?.defaultCleanMode ?? "Trash";
  const {
    rootPath,
    setRootPath,
    targets,
    progress,
    status,
    error,
    scanning,
    cancelling,
    listenersReady,
    cleaningTargetIds,
    step,
    cleanupSummary,
    cleanupMode,
    setStep,
    startScan,
    pickFolder,
    cancelScan,
    cleanTarget,
    refreshTargetSize,
    cleanupModeSupported,
    resetScan,
  } = useScanWorkspace(cleanMode);
  useTheme(settings.settings?.appearance);

  useEffect(() => {
    if (!settings.loading && listenersReady) {
      if (isTauri()) {
        const appWindow = getCurrentWindow();
        void appWindow.show();
        void appWindow.setFocus();
      }
      const splash = document.getElementById("app-splashscreen");
      if (splash) {
        splash.classList.add("splash-fade-out");
        const timer = setTimeout(() => splash.remove(), 300);
        return () => clearTimeout(timer);
      }
    }
  }, [settings.loading, listenersReady]);

  function goBackStep() {
    if (step === 2 && scanning) return;
    setStep(1);
  }

  return (
    <main className="flex h-screen flex-col overflow-hidden bg-forest-950 text-mist-100">
      <Titlebar step={step} />
      <div className="mx-auto flex min-h-0 w-full max-w-screen flex-1 flex-col overflow-hidden px-5 py-5 sm:px-8 lg:px-12">
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center w-full overflow-hidden">
          <WorkspaceForm
            step={step}
            rootPath={rootPath}
            setRootPath={setRootPath}
            startScan={startScan}
            pickFolder={pickFolder}
            cancelScan={cancelScan}
            listenersReady={listenersReady}
            scanning={scanning}
            cancelling={cancelling}
            status={status}
            cleanupSummary={cleanupSummary}
            lastCleanup={settings.settings?.lastCleanup ?? null}
            error={error}
          />

          <ScanView
            step={step}
            scanning={scanning}
            cancelling={cancelling}
            targets={targets}
            progress={progress}
            cancelScan={cancelScan}
          />

          <FindingsSection
            step={step}
            scanning={scanning}
            cancelling={cancelling}
            targets={targets}
            cleaningTargetIds={cleaningTargetIds}
            cleanMode={cleanMode}
            cancelScan={cancelScan}
            onDone={() => setStep(4)}
            onBack={goBackStep}
            cleanTarget={cleanTarget}
            refreshTargetSize={refreshTargetSize}
            cleanupModeSupported={cleanupModeSupported}
          />

          <CompletionView
            step={step}
            cleanupSummary={cleanupSummary}
            cleanupMode={cleanupMode}
            resetScan={resetScan}
          />
        </div>

        <Footer onOpenSettings={() => setSettingsOpen(true)} />
      </div>
      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} {...settings} />
    </main>
  );
}

export default App;
