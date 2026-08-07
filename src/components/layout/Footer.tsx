import { Settings } from "lucide-react";

export function Footer({ onOpenSettings }: { onOpenSettings: () => void }) {
  return (
    <footer className="flex shrink-0 items-center justify-end py-4 text-xs text-mist-500">
      <button type="button" onClick={onOpenSettings} className="grid size-9 place-items-center rounded-xl bg-forest-800 text-mist-500 hover:bg-forest-850 hover:text-mist-100" aria-label="Open settings"><Settings size={16} /></button>
    </footer>
  );
}
