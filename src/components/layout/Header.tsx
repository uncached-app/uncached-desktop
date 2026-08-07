import { Check, Settings } from "lucide-react";
import type { Step } from "../../types/scan";

interface HeaderProps {
  step: Step;
  onOpenSettings: () => void;
}

const STEPS = ["Workspace", "Scan", "Review", "Done"] as const;

export function Header({ step, onOpenSettings }: HeaderProps) {
  return (
    <header className="flex shrink-0 items-center justify-between border-b border-forest-800 pb-4 select-none">
      <div className="flex items-end gap-3">
        <img
          src="/brand/UNCACHED-LOGO-LIGHT-NOBG.svg"
          alt="Uncached"
          className="h-5 w-auto object-contain"
        />
        <p className="hidden text-xs text-mist-500 sm:block font-medium">A calmer way to reclaim space</p>
      </div>

      {/* Minimalist Stepper Pipeline */}
      <div className="flex items-center gap-3">
      <nav aria-label="Progress pipeline" className="hidden items-center gap-1.5 text-xs sm:flex">
        {STEPS.map((label, index) => {
          const stepNumber = (index + 1) as Step;
          const isCurrent = step === stepNumber;
          const isPassed = step > stepNumber;

          return (
            <div key={label} className="flex items-center gap-1.5">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium transition-all ${isCurrent
                  ? "border border-sage-400 bg-forest-800 text-sage-300"
                  : isPassed
                    ? "text-mist-300"
                    : "text-mist-500"
                  }`}
              >
                <span
                  className={`grid size-4 place-items-center rounded-full text-[10px] font-mono ${isCurrent
                    ? "bg-sage-400 text-forest-950 font-bold"
                    : isPassed
                      ? "bg-forest-800 text-sage-300"
                      : "bg-forest-900 text-mist-500"
                    }`}
                >
                  {isPassed ? <Check size={10} strokeWidth={3} /> : stepNumber}
                </span>
                <span>{label}</span>
              </span>
            </div>
          );
        })}
      </nav>
      <button type="button" onClick={onOpenSettings} className="grid size-9 place-items-center rounded-xl bg-forest-800 text-mist-500 hover:bg-forest-850 hover:text-mist-100" aria-label="Open settings"><Settings size={16} /></button>
      </div>
    </header>
  );
}
