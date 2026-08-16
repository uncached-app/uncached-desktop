import { ArrowUpCircle, Loader2, RotateCw } from "lucide-react";
import type { UpdateState } from "../../hooks/useUpdate";

/**
 * That there is a newer Uncached, in the corner, where it can be ignored.
 *
 * A modal on launch would be the app interrupting the reason it was opened to
 * talk about itself, and this one deletes directories for a living — the last
 * thing it should teach is that its dialogs can be dismissed without reading.
 *
 * Silent when there is nothing to say, which includes a failed check: a CDN
 * having a bad day is not news, and a permanent warning badge for it would be
 * the app asking to be worried about. Settings is where somebody who went
 * looking finds out why.
 */
export function UpdateBadge({ update }: { update: UpdateState }) {
  if (update.stage === "idle" || update.stage === "checking" || update.stage === "failed") {
    return null;
  }

  const downloading = update.stage === "downloading";
  const ready = update.stage === "ready";
  const percent = update.progress === null ? null : Math.round(update.progress * 100);

  return (
    <button
      type="button"
      onClick={() => void update.install()}
      disabled={downloading}
      title={
        ready
          ? `Uncached ${update.version} is installed — restart to use it`
          : downloading
            ? `Downloading Uncached ${update.version}`
            : `Uncached ${update.version} is available`
      }
      className={`inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 text-[11px] font-medium transition-colors ${
        downloading
          ? "cursor-default bg-forest-800 text-mist-500"
          : "cursor-pointer bg-forest-800 text-sage-300 hover:bg-forest-850"
      }`}
    >
      {downloading ? (
        <Loader2 size={13} className="animate-spin" aria-hidden="true" />
      ) : ready ? (
        <RotateCw size={13} aria-hidden="true" />
      ) : (
        <ArrowUpCircle size={13} aria-hidden="true" />
      )}
      <span>
        {ready ? "Restart" : downloading ? (percent === null ? "Downloading" : `${percent}%`) : "Update"}
      </span>
    </button>
  );
}
