import { useState } from "react";
import { CompletionView } from "../components/completion/CompletionView";
import { FindingsSection } from "../components/findings/FindingsSection";
import { ScanView } from "../components/scan/ScanView";
import { WorkspaceForm } from "../components/workspace/WorkspaceForm";
import { ProjectPage } from "../components/workspace/ProjectPage";
import { WorkspaceMap } from "../components/workspace/WorkspaceMap";
import { WorkspaceUnavailable } from "../components/workspace/WorkspaceUnavailable";
import { usePurgeFlow } from "../hooks/usePurgeFlow";
import { useWorkspaceHistory } from "../hooks/useWorkspaceHistory";
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
  const { view, setView } = flow;
  const [query, setQuery] = useState("");
  // Resolved every render rather than held: the index is re-read when the
  // window comes back, and a page holding its own copy of a project would go
  // on reporting sizes that have already changed.
  const openProject =
    flow.index.index?.projects.find((project) => project.path === flow.detailPath) ?? null;
  const history = useWorkspaceHistory(
    flow.index.index?.projects ?? [],
    flow.footprints,
    flow.measuring,
  );

  // With no folders left there is nothing to show, so the flow returns to the
  // one screen that works without them: the picker.
  function clearWorkspace() {
    flow.clearRoots();
    flow.index.clearIndex();
    flow.resetScan();
  }

  // Removing the last folder empties the workspace, whichever control did it.
  function removeWorkspaceRoot(root: string) {
    if (flow.extraRoots.length <= 1) clearWorkspace();
    else flow.removeRoot(root);
  }

  // Back out of the artifact list into the projects that own it; the folder
  // picker is only one step further back, and only from there.
  function goBackStep() {
    if (flow.step === 2 && flow.scanning) return;
    if (flow.step === 3 && view === "artifacts" && flow.index.index) {
      setView("projects");
      return;
    }
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

      {view === "projects" && flow.step === 3 && openProject && (
        <ProjectPage
          project={openProject}
          verdict={flow.verdicts[openProject.path] ?? "unknown"}
          footprint={flow.footprints[openProject.path] ?? null}
          targets={flow.targets}
          cleaningTargetIds={flow.cleaningTargetIds}
          cleanMode={cleanMode}
          onClean={async (targetId, confirmation) => {
            const result = await flow.cleanTarget(targetId, confirmation);
            // The row goes as soon as the target does; the weights do not, so
            // the project is read again rather than left claiming what it no
            // longer holds.
            if (result) await flow.remeasureProject(openProject.path);
            return result !== null;
          }}
          onBack={flow.closeProject}
          onShowInList={() => {
            flow.closeProject();
            flow.focusProject(openProject.path);
          }}
          onOpenProject={flow.openProject}
        />
      )}

      {view === "projects" && flow.step === 3 && !openProject && flow.index.index && (
        <WorkspaceMap
          index={flow.index.index}
          query={query}
          onQueryChange={setQuery}
          proEnabled={proEnabled}
          footprints={flow.footprints}
          measuring={flow.measuring}
          verdicts={flow.verdicts}
          chosenRoots={flow.extraRoots}
          onAddRoot={flow.pickRoot}
          onRemoveRoot={removeWorkspaceRoot}
          onRemoveAllRoots={clearWorkspace}
          targetCount={flow.targets.length}
          onReclaim={() => setView("artifacts")}
          change={history.change}
          reclaimed={history.totals}
          activeVerdict={flow.activeVerdict as never}
          setActiveVerdict={flow.setActiveVerdict as never}
          focusPath={flow.focusPath}
          onFocusHandled={flow.clearFocus}
          onOpenProject={flow.openProject}
        />
      )}

      {/* The map needs an index; the step that shows it does not wait for one.
          Without this the screen the scan sends the user to renders nothing at
          all whenever discovery fails or is still running. */}
      {view === "projects" && flow.step === 3 && !openProject && !flow.index.index && (
        <WorkspaceUnavailable
          error={flow.index.error}
          onRetry={() => void flow.index.scanRoots(flow.extraRoots)}
          onChooseFolders={() => flow.setStep(1)}
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
        // Re-reads instead of restoring the old map: the targets that were just
        // removed are still counted in the weights it was built from.
        backToWorkspace={flow.extraRoots.length > 0 ? () => void flow.startScan() : undefined}
      />
    </>
  );
}
