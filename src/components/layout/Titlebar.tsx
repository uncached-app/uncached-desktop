import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isTauri } from "@tauri-apps/api/core";
import { Check, Maximize2, Minus, Square, X } from "lucide-react";
import type { Step } from "../../types/scan";

const STEPS = ["Workspace", "Scan", "Review", "Done"] as const;

export function Titlebar({ step }: { step: Step }) {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!isTauri()) return;
    void getCurrentWindow().isMaximized().then(setMaximized);
  }, []);

  async function minimize() {
    if (isTauri()) await getCurrentWindow().minimize();
  }

  async function toggleMaximize() {
    if (!isTauri()) return;
    const window = getCurrentWindow();
    await window.toggleMaximize();
    setMaximized(await window.isMaximized());
  }

  async function close() {
    if (isTauri()) await getCurrentWindow().close();
  }

  return (
    <header
      data-tauri-drag-region
      onDoubleClick={toggleMaximize}
      className="flex h-12 shrink-0 items-center justify-between bg-forest-950 px-4 select-none"
    >
      <img src="/brand/UNCACHED-LOGO-LIGHT-NOBG.svg" alt="Uncached" className="theme-logo-light h-5 w-auto object-contain" />
      <img src="/brand/UNCACHED-LOGO-DARK-NOBG.svg" alt="" className="theme-logo-dark h-5 w-auto object-contain" />
      <nav aria-label="Progress pipeline" className="hidden items-center gap-1.5 text-xs sm:flex" data-tauri-drag-region="false">
        {STEPS.map((label, index) => {
          const stepNumber = (index + 1) as Step;
          const isCurrent = step === stepNumber;
          const isPassed = step > stepNumber;
          return <span key={label} className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium ${isCurrent ? "bg-forest-800 text-sage-300" : isPassed ? "text-mist-300" : "text-mist-500"}`}><span className={`grid size-4 place-items-center rounded-full text-[10px] font-mono ${isCurrent ? "bg-sage-400 font-bold text-forest-950" : isPassed ? "bg-forest-800 text-sage-300" : "bg-forest-900 text-mist-500"}`}>{isPassed ? <Check size={10} strokeWidth={3} /> : stepNumber}</span>{label}</span>;
        })}
      </nav>
      <div className="flex items-center gap-1" data-tauri-drag-region="false">
        <button type="button" onClick={minimize} className="grid size-7 place-items-center rounded-md bg-forest-800 text-mist-500 hover:bg-forest-850 hover:text-mist-100" aria-label="Minimize window"><Minus size={14} /></button>
        <button type="button" onClick={toggleMaximize} className="grid size-7 place-items-center rounded-md bg-forest-800 text-mist-500 hover:bg-forest-850 hover:text-mist-100" aria-label={maximized ? "Restore window" : "Maximize window"}>{maximized ? <Maximize2 size={13} /> : <Square size={12} />}</button>
        <button type="button" onClick={close} className="grid size-7 place-items-center rounded-md bg-forest-800 text-mist-500 hover:bg-coral-300 hover:text-forest-950" aria-label="Close window"><X size={14} /></button>
      </div>
    </header>
  );
}
