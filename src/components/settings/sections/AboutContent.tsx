import { useTranslation } from "react-i18next";
import { SupportActions } from "../SupportActions";
import type { UpdateState } from "../../../hooks/useUpdate";
import { openExternalUrl } from "../../../utils/externalLink";

export function AboutContent({
  appInfo,
  update,
  onOpenUpdate,
}: {
  appInfo: { name: string; version: string; website: string } | null;
  update: UpdateState;
  onOpenUpdate: () => void;
}) {
  const { t } = useTranslation();
  const websiteUrl = appInfo?.website ?? "https://uncached.app";
  const eulaUrl = "https://uncached.app/eula";

  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <img src="/brand/UNCACHED-ICON-NIGHT.svg" alt="" className="size-20" />
      <h3 className="mt-6 text-2xl font-semibold text-mist-100">{appInfo?.name ?? "Uncached"}</h3>
      <p className="mt-2 text-sm text-mist-500">{t("settings.about.tagline")}</p>
      <p className="mt-6 font-mono text-xs text-mist-500">
        {t("settings.about.version", { version: appInfo?.version ?? "..." })}
      </p>

      <UpdateStatus update={update} onOpenUpdate={onOpenUpdate} />
      <div className="mt-5 flex flex-col items-center gap-2">
        <a
          href={websiteUrl}
          onClick={(e) => openExternalUrl(websiteUrl, e)}
          className="text-sm text-sage-300 hover:text-sage-400"
        >
          uncached.app
        </a>
        <a
          href={eulaUrl}
          onClick={(e) => openExternalUrl(eulaUrl, e)}
          className="text-xs text-mist-500 hover:text-mist-300 underline"
        >
          {t("settings.about.eula")}
        </a>
      </div>
      <SupportActions />
    </div>
  );
}

/**
 * Where somebody who went looking finds out about updates.
 *
 * Asking is what happens here; reading and accepting happen in the dialog.
 * This pane is a centred column beside a logo and two links, and release notes
 * are prose — they were being wrapped into a ribbon at `max-w-xs`, with the
 * download progress reported in the same thread. What is left is the state in
 * one line and the button that leads to the rest.
 *
 * It stays the only place a failed check is reported. A CDN that could not be
 * reached is ordinary, and a permanent warning for it would be the app asking
 * to be worried about — but silence everywhere would leave "why has it not
 * updated" with no answer at all.
 */
function UpdateStatus({ update, onOpenUpdate }: { update: UpdateState; onOpenUpdate: () => void }) {
  const { t } = useTranslation();
  const offered = update.stage === "available" || update.stage === "ready";
  const busy = update.stage === "checking" || update.stage === "downloading";

  return (
    <div className="mt-3 flex flex-col items-center gap-2">
      {update.stage === "available" && (
        <p className="text-xs text-sage-300">
          {t("settings.about.update.available", { version: update.version ?? "" })}
        </p>
      )}
      {update.stage === "downloading" && (
        <p className="text-xs text-mist-500">
          {update.progress === null
            ? t("settings.about.update.downloading", { version: update.version ?? "" })
            : t("settings.about.update.downloadingProgress", {
              version: update.version ?? "",
              percent: Math.round(update.progress * 100),
            })}
        </p>
      )}
      {update.stage === "ready" && (
        <p className="text-xs text-sage-300">
          {t("settings.about.update.ready", { version: update.version ?? "" })}
        </p>
      )}
      {update.stage === "failed" && update.problem && (
        <p className="max-w-xs text-xs leading-5 text-mist-500">{update.problem}</p>
      )}

      <button
        type="button"
        onClick={() => (offered || busy ? onOpenUpdate() : void update.check(true))}
        disabled={update.stage === "checking"}
        className="cursor-pointer rounded-lg border border-forest-800 px-2.5 py-1 text-xs font-medium text-mist-300 transition-colors hover:border-sage-400/60 hover:bg-forest-850 hover:text-mist-100 disabled:cursor-default disabled:opacity-50"
      >
        {update.stage === "checking"
          ? t("settings.about.update.checking")
          : update.stage === "downloading"
            ? t("settings.about.update.showProgress")
            : update.stage === "available"
              ? t("settings.about.update.whatsNew")
              : update.stage === "ready"
                ? t("settings.about.update.restart")
                : t("settings.about.update.check")}
      </button>
    </div>
  );
}
