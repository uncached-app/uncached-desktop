import { History, LockKeyhole, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { openExternalUrl } from "../../utils/externalLink";

/** Pro is the only plan that writes anything down, so this is what Free sees instead. */
export function ProPanel() {
  const { t } = useTranslation();

  return (
    <div className="relative overflow-hidden rounded-2xl border border-pro-200/30 bg-pro-surface p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-xl">
          <div className="inline-flex items-center gap-1.5 rounded-md border border-pro-200/30 bg-forest-950 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-pro-100 mb-3">
            <LockKeyhole size={11} aria-hidden="true" />
            <span>{t("insights.pro.badge")}</span>
          </div>

          <h2 className="text-base font-semibold text-mist-100">
            {t("insights.pro.title")}
          </h2>

          <p className="mt-2 text-xs leading-relaxed text-mist-500">
            {t("insights.pro.body")}
          </p>
        </div>

        <button
          type="button"
          onClick={() => openExternalUrl("https://uncached.app/pro")}
          className="inline-flex items-center gap-1.5 rounded-xl bg-pro-200 px-4 py-2.5 text-xs font-semibold text-forest-950 shadow-sm transition-all hover:opacity-90 active:scale-[0.99]"
        >
          <Sparkles size={13} aria-hidden="true" />
          <span>{t("insights.pro.cta")}</span>
        </button>
      </div>
    </div>
  );
}

/** Pro, but nothing reclaimed yet. Saying so beats an empty chart. */
export function NoHistoryYet() {
  const { t } = useTranslation();

  return (
    <div className="rounded-2xl border border-forest-800 bg-forest-900 py-14 px-6 text-center">
      <div className="mx-auto grid size-12 place-items-center rounded-2xl border border-forest-800 bg-forest-950 text-mist-500">
        <History size={22} strokeWidth={1.5} aria-hidden="true" />
      </div>
      <h3 className="mt-4 text-sm font-semibold text-mist-100">{t("insights.noHistory.title")}</h3>
      <p className="mt-1.5 text-xs text-mist-500 max-w-sm mx-auto">
        {t("insights.noHistory.body")}
      </p>
    </div>
  );
}
