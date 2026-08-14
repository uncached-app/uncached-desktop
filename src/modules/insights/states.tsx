import { HardDrive } from "lucide-react";
import { openExternalUrl } from "../../utils/externalLink";

/** Pro is the only plan that writes anything down, so this is what Free sees instead. */
export function ProPanel() {
  return (
    <div className="rounded-2xl border border-pro-200/30 bg-pro-surface p-5">
      <p className="text-sm font-semibold text-mist-100">Your cleanup history is a Pro feature</p>
      <p className="mt-1.5 max-w-prose text-xs leading-5 text-mist-500">
        Free reads the machine fresh every time and writes nothing down. Pro records every cleanup —
        including the ones a schedule runs while you are not looking — and reports them back: how much
        came off the disk, from which workspace, which ecosystem it belonged to, and how this month
        compares with the last.
      </p>
      <button
        type="button"
        onClick={() => openExternalUrl("https://uncached.app/pro")}
        className="mt-4 rounded-xl bg-pro-200 px-3 py-2 text-xs font-semibold text-forest-950 transition-colors hover:bg-pro-100"
      >
        Get Uncached Pro
      </button>
    </div>
  );
}

/** Pro, but nothing reclaimed yet. Saying so beats an empty chart. */
export function NoHistoryYet() {
  return (
    <div className="rounded-2xl border border-forest-800 bg-forest-900 py-12 text-center">
      <HardDrive size={26} className="mx-auto text-mist-500" strokeWidth={1.5} aria-hidden="true" />
      <p className="mt-3 text-sm font-semibold text-mist-300">No cleanup recorded yet.</p>
      <p className="mt-1 text-xs text-mist-500">
        The first one you run starts the history, and this becomes a report.
      </p>
    </div>
  );
}
