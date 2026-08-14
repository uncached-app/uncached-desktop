import { useState } from "react";
import { AppLayout } from "./layouts/AppLayout";
import { InsightsModule } from "./modules/InsightsModule";
import { IntelligenceModule } from "./modules/IntelligenceModule";
import { PurgeModule } from "./modules/PurgeModule";
import { PurgeFlowProvider } from "./hooks/usePurgeFlow";
import { useEntitlement } from "./hooks/useEntitlement";
import { useIgnoreRuleCount } from "./hooks/useIgnoreRuleCount";
import { useSettings } from "./hooks/useSettings";
import { useTheme } from "./hooks/useTheme";
import type { AppModule } from "./types/module";

function App() {
  const settings = useSettings();
  const entitlement = useEntitlement();
  const [activeModule, setActiveModule] = useState<AppModule>("reclaim");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const cleanMode = settings.settings?.defaultCleanMode ?? "Trash";
  // Counted in Rust: comments and blanks are not rules.
  const activeIgnoreRules = useIgnoreRuleCount(settings.settings?.ignoreRules ?? "");
  useTheme(settings.settings?.appearance);

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
          <InsightsModule proEnabled={entitlement.proEnabled} onOpenWorkspace={() => setActiveModule("reclaim")} />
        ) : activeModule === "intelligence" ? (
          <IntelligenceModule
            proEnabled={entitlement.proEnabled}
            onOpenWorkspace={() => setActiveModule("reclaim")}
          />
        ) : (
        <PurgeModule
          proEnabled={entitlement.proEnabled}
          cleanMode={cleanMode}
          lastCleanup={settings.settings?.lastCleanup ?? null}
          activeIgnoreRules={activeIgnoreRules}
        />
        )}
      </AppLayout>
    </PurgeFlowProvider>
  );
}

export default App;
