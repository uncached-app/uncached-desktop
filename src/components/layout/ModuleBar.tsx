import { Bot, Folders, Sparkles } from "lucide-react";
import type React from "react";
import type { AppModule } from "../../types/module";

type ModuleBarProps = {
  activeModule: AppModule;
  onChange: (module: AppModule) => void;
  /** Insights reads the same scan; the plan decides whether it is reachable. */
  proEnabled: boolean;
};

export function ModuleBar({ activeModule, onChange, proEnabled }: ModuleBarProps) {
  return (
    <nav className="flex shrink-0 items-center justify-center gap-1 border-t border-forest-800 bg-forest-900/40 px-4 py-2" aria-label="Uncached modules">
      <ModuleButton active={activeModule === "reclaim"} label="Uncached Workspace" onClick={() => onChange("reclaim")}>
        <Folders size={15} strokeWidth={1.8} className={activeModule === "reclaim" ? "text-sage-300" : "text-mist-500"} aria-hidden="true" />
        <span>Workspace</span>
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
