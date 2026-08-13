import { useState } from "react";
import { CompletionView } from "../components/completion/CompletionView";
import { FindingsSection } from "../components/findings/FindingsSection";
import { ScanView } from "../components/scan/ScanView";
import { WorkspaceForm } from "../components/workspace/WorkspaceForm";
import { WorkspaceMap } from "../components/workspace/WorkspaceMap";
import { ResultsView } from "../components/findings/ResultsView";
import { usePurgeFlow } from "../hooks/usePurgeFlow";
import type { CleanMode, LastCleanup } from "../types/settings";

type PurgeModuleProps = {
  proEnabled: boolean;
  cleanMode: CleanMode;
  lastCleanup: LastCleanup | null;
  activeIgnoreRules: number;
};

/**
 * The four screens of the scan-and-clean flow.
 *
 * All four stay mounted and each renders only on its own step, which is what
 * lets their exit animations play. The step lives in the flow, not here.
 */
export function PurgeModule({ proEnabled, cleanMode, lastCleanup, activeIgnoreRules }: PurgeModuleProps) {
  const flow = usePurgeFlow();
  const [view, setView] = useState<"projects" | "artifacts">("projects");
  const [query, setQuery] = useState("");

  function goBackStep() {
    if (flow.step === 2 && flow.scanning) return;
    flow.setStep(1);
  }

  return (
    <>
      <WorkspaceForm
        step={flow.step}
        extraRoots={flow.extraRoots}
        removeRoot={flow.removeRoot}
        pickRoot={flow.pickRoot}
        proEnabled={proEnabled}
        startScan={flow.startScan}
        cancelScan={flow.cancelScan}
        listenersReady={flow.listenersReady}
        scanning={flow.scanning}
        cancelling={flow.cancelling}
        status={flow.status}
        cleanupSummary={flow.cleanupSummary}
        lastCleanup={lastCleanup}
        error={flow.error}
      />

      <ScanView
        step={flow.step}
        scanning={flow.scanning}
        cancelling={flow.cancelling}
        targets={flow.targets}
        progress={flow.progress}
        cancelScan={flow.cancelScan}
      />

      <ResultsView
        step={flow.step}
        view={view}
        onViewChange={setView}
        projectCount={flow.index.index?.projects.length ?? 0}
        targetCount={flow.targets.length}
        indexing={flow.index.loading}
      />

      {view === "projects" && flow.step === 3 && flow.index.index && (
        <WorkspaceMap
          index={flow.index.index}
          loading={flow.index.loading}
          query={query}
          onQueryChange={setQuery}
          onScan={() => flow.index.scanRoots(flow.extraRoots)}
          onOpenProject={() => {}}
          proEnabled={proEnabled}
          footprints={flow.footprints}
          measuring={flow.measuring}
          verdicts={flow.verdicts}
        />
      )}

      {view === "artifacts" && <FindingsSection
        step={flow.step}
        scanning={flow.scanning}
        cancelling={flow.cancelling}
        targets={flow.targets}
        cleaningTargetIds={flow.cleaningTargetIds}
        cleanMode={cleanMode}
        cancelScan={flow.cancelScan}
        onDone={() => flow.setStep(4)}
        onBack={goBackStep}
        cleanTarget={flow.cleanTarget}
        refreshTargetSize={flow.refreshTargetSize}
        cleanupModeSupported={flow.cleanupModeSupported}
        proEnabled={proEnabled}
        activeIgnoreRules={activeIgnoreRules}
      />}

      <CompletionView
        step={flow.step}
        cleanupSummary={flow.cleanupSummary}
        cleanupMode={flow.cleanupMode}
        resetScan={flow.resetScan}
      />
    </>
  );
}
