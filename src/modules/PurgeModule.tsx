import { CompletionView } from "../components/completion/CompletionView";
import { FindingsSection } from "../components/findings/FindingsSection";
import { ScanView } from "../components/scan/ScanView";
import { WorkspaceForm } from "../components/workspace/WorkspaceForm";
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

      <FindingsSection
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
      />

      <CompletionView
        step={flow.step}
        cleanupSummary={flow.cleanupSummary}
        cleanupMode={flow.cleanupMode}
        resetScan={flow.resetScan}
      />
    </>
  );
}
