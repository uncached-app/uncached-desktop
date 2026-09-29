import { FolderSearch, Loader2, LockKeyhole, Sparkles, TriangleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { openExternalUrl } from "../../utils/externalLink";

function Panel({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-forest-800 bg-forest-900 px-6 py-14 text-center">
      <div className="mx-auto grid size-12 place-items-center rounded-2xl border border-forest-800 bg-forest-950 text-mist-500">
        {icon}
      </div>
      <h3 className="mt-4 text-sm font-semibold text-mist-100">{title}</h3>
      <div className="mx-auto mt-1.5 max-w-sm text-xs leading-5 text-mist-500">{children}</div>
    </div>
  );
}

/** Nothing to read yet, and the reason is one the user can act on. */
export function NoFoldersChosen({ onChoose }: { onChoose: () => void }) {
  const { t } = useTranslation();

  return (
    <Panel icon={<FolderSearch size={22} strokeWidth={1.5} aria-hidden="true" />} title={t("maintenance.states.noFolders.title")}>
      <p>{t("maintenance.states.noFolders.body")}</p>
      <button
        type="button"
        onClick={onChoose}
        className="mt-4 rounded-xl border border-forest-800 bg-forest-950 px-3 py-2 text-xs font-medium text-mist-100 transition-colors hover:bg-forest-850 cursor-pointer"
      >
        {t("maintenance.states.noFolders.action")}
      </button>
    </Panel>
  );
}

export function ReadingFolders() {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center select-none">
      <Loader2 size={26} className="animate-spin text-sage-400" aria-hidden="true" />
      <h3 className="mt-3 text-sm font-semibold text-mist-100">{t("maintenance.states.reading.title")}</h3>
      <p className="mt-1 text-xs text-mist-500">{t("maintenance.states.reading.body")}</p>
    </div>
  );
}

/**
 * Named rather than counted as a selection of nothing. A project without a
 * weight is unknown, and a policy applied to half a workspace is a different
 * policy from the one the user set.
 */
export function Measuring({ measured, total }: { measured: number; total: number }) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center select-none">
      <Loader2 size={26} className="animate-spin text-sage-400" aria-hidden="true" />
      <h3 className="mt-3 text-sm font-semibold text-mist-100">
        {t("maintenance.states.measuring.title", { measured, count: total })}
      </h3>
      <p className="mt-1 text-xs text-mist-500">{t("maintenance.states.measuring.body")}</p>
    </div>
  );
}

export function NoProjects({ roots }: { roots: number }) {
  const { t } = useTranslation();

  return (
    <Panel
      icon={<FolderSearch size={22} strokeWidth={1.5} aria-hidden="true" />}
      title={t("maintenance.states.noProjects.title", { count: roots })}
    >
      <p>{t("maintenance.states.noProjects.body")}</p>
    </Panel>
  );
}

export function IndexFailed({ message }: { message: string }) {
  const { t } = useTranslation();

  return (
    <Panel icon={<TriangleAlert size={22} strokeWidth={1.5} aria-hidden="true" />} title={t("maintenance.states.indexFailed.title")}>
      <p className="font-mono text-[11px] break-words">{message}</p>
    </Panel>
  );
}

/**
 * What Free is shown instead of the run button.
 *
 * The selection itself stays on screen: it is read from an index Free already
 * builds, and hiding it would mean charging for the sentence that makes anyone
 * want the feature. What Pro adds is the run, and the record of it.
 */
export function ProPanel() {
  const { t } = useTranslation();

  return (
    <div className="relative overflow-hidden rounded-2xl border border-pro-200/30 bg-pro-surface p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-xl">
          <div className="mb-3 inline-flex items-center gap-1.5 rounded-md border border-pro-200/30 bg-forest-950 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-pro-100">
            <LockKeyhole size={11} aria-hidden="true" />
            <span>{t("maintenance.states.pro.badge")}</span>
          </div>

          <h2 className="text-base font-semibold text-mist-100">{t("maintenance.states.pro.title")}</h2>

          <p className="mt-2 text-xs leading-relaxed text-mist-500">
            {t("maintenance.states.pro.body")}
          </p>
        </div>

        <button
          type="button"
          onClick={() => openExternalUrl("https://uncached.app/pro")}
          className="inline-flex items-center gap-1.5 rounded-xl bg-pro-200 px-4 py-2.5 text-xs font-semibold text-forest-950 shadow-sm transition-all hover:opacity-90 active:scale-[0.99]"
        >
          <Sparkles size={13} aria-hidden="true" />
          <span>{t("maintenance.states.pro.cta")}</span>
        </button>
      </div>
    </div>
  );
}
