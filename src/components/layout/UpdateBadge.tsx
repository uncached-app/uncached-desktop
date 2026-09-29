import { ArrowUpCircle, Loader2, RotateCw } from "lucide-react";
import { useTranslation } from "react-i18next";
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
 *
 * It opens the dialog rather than starting the download itself. Pressing a
 * word this small should not commit anyone to replacing their application
 * before they have seen what is in the release.
 */
export function UpdateBadge({ update, onOpen }: { update: UpdateState; onOpen: () => void }) {
  const { t } = useTranslation();
  if (update.stage === "idle" || update.stage === "checking" || update.stage === "failed") {
    return null;
  }

  const downloading = update.stage === "downloading";
  const ready = update.stage === "ready";
  const percent = update.progress === null ? null : Math.round(update.progress * 100);

  return (
    <button
      type="button"
      onClick={onOpen}
      title={
        ready
          ? t("shell.update.badge.readyTitle", { version: update.version })
          : downloading
            ? t("shell.update.downloadingTitle", { version: update.version })
            : t("shell.update.available", { version: update.version })
      }
      // Clickable while downloading too: that is when somebody most wants to
      // see how far along it is, and the dialog is where the progress is.
      className={`inline-flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-md bg-forest-800 px-2 text-[11px] font-medium transition-colors hover:bg-forest-850 ${
        downloading ? "text-mist-500" : "text-sage-300"
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
        {ready
          ? t("shell.update.badge.restart")
          : downloading
            ? (percent === null ? t("shell.update.badge.downloading") : t("shell.update.percent", { percent }))
            : t("shell.update.badge.update")}
      </span>
    </button>
  );
}
