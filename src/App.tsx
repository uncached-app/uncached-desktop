import { useEffect, useState } from "react";
import { applyLanguage } from "./i18n";
import { AppLayout } from "./layouts/AppLayout";
import { DependenciesModule } from "./modules/DependenciesModule";
import { InsightsModule } from "./modules/InsightsModule";
import { IntelligenceModule } from "./modules/IntelligenceModule";
import { PurgeModule } from "./modules/PurgeModule";
import { PurgeFlowProvider } from "./hooks/usePurgeFlow";
import { useEntitlement } from "./hooks/useEntitlement";
import { useIgnoreRuleCount } from "./hooks/useIgnoreRuleCount";
import { useSettings } from "./hooks/useSettings";
import { useTheme } from "./hooks/useTheme";
import { useThemeFiles } from "./hooks/useThemeFiles";
import { DEFAULT_POLICY, DEFAULT_SCHEDULE } from "./types/maintenance";
import type { AppModule } from "./types/module";

function App() {
  const settings = useSettings();
  const entitlement = useEntitlement();
  const [activeModule, setActiveModule] = useState<AppModule>("reclaim");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const cleanMode = settings.settings?.defaultCleanMode ?? "Trash";
  // Counted in Rust: comments and blanks are not rules.
  const activeIgnoreRules = useIgnoreRuleCount(settings.settings?.ignoreRules ?? "");
  // A theme whose file has since been deleted falls back to the built-in
  // rather than leaving the window painted half by a file that is gone.
  const { themes } = useThemeFiles();
  const theme = themes.find((entry) => entry.id === settings.settings?.theme) ?? null;
  useTheme(settings.settings?.appearance, theme);
  const language = settings.settings?.language;
  useEffect(() => {
    if (language) applyLanguage(language);
  }, [language]);

  return (
    <PurgeFlowProvider
      cleanMode={cleanMode}
      savedRoots={settings.settings?.workspaceRoots ?? null}
      onRootsChange={(roots) => void settings.updateSettings({ workspaceRoots: roots })}
      proEnabled={entitlement.proEnabled}
    >
      <AppLayout
        activeModule={activeModule}
        onModuleChange={setActiveModule}
        settings={settings}
        settingsOpen={settingsOpen}
        onSettingsOpenChange={setSettingsOpen}
        onLicenseChange={entitlement.refresh}
        proEnabled={entitlement.proEnabled}
      >
        {activeModule === "insights" ? (
          <InsightsModule
            proEnabled={entitlement.proEnabled}
            onOpenWorkspace={() => setActiveModule("reclaim")}
            grain={settings.settings?.insightsGrain ?? "month"}
            onGrainChange={(insightsGrain) => void settings.updateSettings({ insightsGrain })}
          />
        ) : activeModule === "dependencies" ? (
          <DependenciesModule onOpenWorkspace={() => setActiveModule("reclaim")} />
        ) : activeModule === "intelligence" ? (
          <IntelligenceModule
            proEnabled={entitlement.proEnabled}
            policy={settings.settings?.maintenance ?? DEFAULT_POLICY}
            onPolicyChange={(maintenance) => void settings.updateSettings({ maintenance })}
            schedule={settings.settings?.maintenanceSchedule ?? DEFAULT_SCHEDULE}
            onScheduleChange={(maintenanceSchedule) =>
              settings.updateSettings({ maintenanceSchedule })
            }
            onOpenWorkspace={() => setActiveModule("reclaim")}
          />
        ) : (
        <PurgeModule
          proEnabled={entitlement.proEnabled}
          cleanMode={cleanMode}
          shortcuts={settings.settings?.shortcuts}
          sidebarHidden={settings.settings?.workspaceSidebarHidden ?? false}
          onSidebarHiddenChange={(workspaceSidebarHidden) =>
            void settings.updateSettings({ workspaceSidebarHidden })
          }
          lastCleanup={settings.settings?.lastCleanup ?? null}
          activeIgnoreRules={activeIgnoreRules}
          maintenancePolicy={entitlement.proEnabled ? (settings.settings?.maintenance ?? DEFAULT_POLICY) : null}
          onMaintenancePolicyChange={(maintenance) => void settings.updateSettings({ maintenance })}
        />
        )}
      </AppLayout>
    </PurgeFlowProvider>
  );
}

export default App;
