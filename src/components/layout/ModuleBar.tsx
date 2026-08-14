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
    <nav className="flex shrink-0 items-center justify-center gap-1.5 border-t border-forest-800 bg-forest-950 px-4 py-3 sm:gap-2 sm:px-6" aria-label="Uncached modules">
      <ModuleButton active={activeModule === "reclaim"} label="Uncached Workspace" onClick={() => onChange("reclaim")}>
        <Folders size={16} strokeWidth={1.8} aria-hidden="true" />
        <span>Workspace</span>
      </ModuleButton>
      <ModuleButton
        active={activeModule === "intelligence"}
        label={proEnabled ? "Uncached Maintenance" : "Uncached Maintenance (Pro)"}
        onClick={() => onChange("intelligence")}
      >
        <Bot size={16} strokeWidth={1.8} aria-hidden="true" />
        <span className="hidden sm:inline">Maintenance</span>
      </ModuleButton>
      {/* Reachable on every plan. A module nobody can open is a module nobody
          wants: Free reads the findings, Pro measures them. */}
      <ModuleButton
        active={activeModule === "insights"}
        label={proEnabled ? "Uncached Insights" : "Uncached Insights (Pro)"}
        onClick={() => onChange("insights")}
      >
        <Sparkles size={16} strokeWidth={1.8} aria-hidden="true" />
        <span className="hidden sm:inline">Insights</span>
      </ModuleButton>
    </nav>
  );
}

function ModuleButton({ active, label, onClick, disabled = false, children }: {
  active: boolean;
  label: string;
  onClick?: () => void;
  pro?: boolean;
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
      className={`relative inline-flex min-h-9 items-center gap-2 rounded-xl px-3 text-xs font-medium transition-colors sm:px-4 ${active ? "bg-sage-400 text-forest-950" : "text-mist-500 hover:bg-forest-800"} disabled:cursor-not-allowed disabled:opacity-45`}
    >
      {children}
    </button>
  );
}
