import { Bot, Folders, HardDrive, Settings, Sparkles } from "lucide-react";
import type React from "react";
import type { AppModule } from "../../types/module";
import type { ResultsView } from "../../hooks/usePurgeFlow";

type ModuleBarProps = {
  activeModule: AppModule;
  onChange: (module: AppModule) => void;
  /** Insights reads the same scan; the plan decides whether it is reachable. */
  proEnabled: boolean;
  /**
   * Which of Workspace's two readings is open.
   *
   * Reclaim is not a module — it is the artifact list inside Workspace, and it
   * is here because getting to it meant first landing on the projects and then
   * finding a button. Somebody who opened this app to free disk should not have
   * to pass through a map of their work to do it.
   */
  view: ResultsView;
  onViewChange: (view: ResultsView) => void;
  /**
   * Where settings opens from, off macOS.
   *
   * A Mac keeps it in the titlebar beside the traffic lights. Everywhere else
   * that corner belongs to minimise, maximise and close, so it sits at the end
   * of this bar — which is the one strip on screen that is always there. It
   * used to be in a footer that only the Workspace module drew, so on Windows
   * the way into settings disappeared on two of the three screens.
   */
  onOpenSettings?: () => void;
};

export function ModuleBar({
  activeModule,
  onChange,
  proEnabled,
  view,
  onViewChange,
  onOpenSettings,
}: ModuleBarProps) {
  const inWorkspace = activeModule === "reclaim";

  function go(module: AppModule, next: ResultsView) {
    onChange(module);
    onViewChange(next);
  }

  return (
    <nav className="relative flex shrink-0 items-center justify-center gap-1 border-t border-forest-800 bg-forest-900/40 px-4 py-2" aria-label="Uncached modules">
      <ModuleButton
        active={inWorkspace && view === "projects"}
        label="Uncached Workspace"
        onClick={() => go("reclaim", "projects")}
      >
        <Folders size={15} strokeWidth={1.8} className={inWorkspace && view === "projects" ? "text-sage-300" : "text-mist-500"} aria-hidden="true" />
        <span>Workspace</span>
      </ModuleButton>

      {/* Before a folder is chosen this lands on the same picker Workspace
          does — there is nothing to reclaim yet, and inventing a second empty
          state for that would be two screens saying one thing. */}
      <ModuleButton
        active={inWorkspace && view === "artifacts"}
        label="Reclaim disk"
        onClick={() => go("reclaim", "artifacts")}
      >
        <HardDrive size={15} strokeWidth={1.8} className={inWorkspace && view === "artifacts" ? "text-sage-300" : "text-mist-500"} aria-hidden="true" />
        <span>Reclaim</span>
      </ModuleButton>
      <ModuleButton
        active={activeModule === "intelligence"}
        label={proEnabled ? "Uncached Maintenance" : "Uncached Maintenance (Pro)"}
        onClick={() => onChange("intelligence")}
      >
        <Bot size={15} strokeWidth={1.8} className={activeModule === "intelligence" ? "text-sage-300" : "text-mist-500"} aria-hidden="true" />
        <span className="hidden sm:inline">Maintenance</span>
      </ModuleButton>
      <ModuleButton
        active={activeModule === "insights"}
        label={proEnabled ? "Uncached Insights" : "Uncached Insights (Pro)"}
        onClick={() => onChange("insights")}
      >
        <Sparkles size={15} strokeWidth={1.8} className={activeModule === "insights" ? "text-sage-300" : "text-mist-500"} aria-hidden="true" />
        <span className="hidden sm:inline">Insights</span>
      </ModuleButton>

      {/* Absolute, so the modules stay centred on the bar rather than being
          pushed off-centre by a control that is not one of them. */}
      {onOpenSettings && (
        <button
          type="button"
          onClick={onOpenSettings}
          aria-label="Open settings"
          title="Settings"
          className="absolute right-4 grid size-8 cursor-pointer place-items-center rounded-lg text-mist-500 transition-colors hover:bg-forest-850 hover:text-mist-100"
        >
          <Settings size={16} strokeWidth={1.8} aria-hidden="true" />
        </button>
      )}
    </nav>
  );
}

function ModuleButton({ active, label, onClick, disabled = false, children }: {
  active: boolean;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-current={active ? "page" : undefined}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex h-8 items-center gap-2 rounded-lg px-3 text-xs transition-colors ${
        active
          ? "bg-forest-800/80 font-semibold text-mist-100"
          : "font-medium text-mist-500 hover:bg-forest-850/50 hover:text-mist-300"
      } disabled:cursor-not-allowed disabled:opacity-45`}
    >
      {children}
    </button>
  );
}
