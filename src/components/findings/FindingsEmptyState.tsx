import { ArrowLeft, FolderSearch } from "lucide-react";
import { useTranslation } from "react-i18next";

interface FindingsEmptyStateProps {
  scanning: boolean;
  minAgeDays: number;
  onShowEveryAge: () => void;
  onBack: () => void;
}

export function FindingsEmptyState({ scanning, minAgeDays, onShowEveryAge, onBack }: FindingsEmptyStateProps) {
  const { t } = useTranslation();

  return (
    <div className="my-5 grid min-h-52 flex-1 place-items-center rounded-2xl border border-forest-800 bg-forest-900 px-6 py-10 text-center">
      <div>
        <FolderSearch size={32} className="mx-auto text-mist-500" strokeWidth={1.5} aria-hidden="true" />
        <p className="mt-4 text-sm font-medium text-mist-300">
          {scanning ? t("findings.empty.scanning") : t("findings.empty.none")}
        </p>
        <p className="mt-1 text-sm text-mist-500">
          {scanning
            ? t("findings.empty.scanningHint")
            : minAgeDays > 0
              ? t("findings.empty.tooRecent", { count: minAgeDays })
              : t("findings.empty.settingsHint")}
        </p>
        {!scanning && minAgeDays > 0 && (
          <button
            type="button"
            onClick={onShowEveryAge}
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-forest-800 px-4 py-2.5 text-sm font-medium text-mist-300 hover:bg-forest-850 hover:text-sage-300"
          >
            {t("findings.empty.showEveryAge")}
          </button>
        )}
        {!scanning && minAgeDays === 0 && (
          <button
            type="button"
            onClick={onBack}
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-forest-800 px-4 py-2.5 text-sm font-medium text-mist-300 hover:bg-forest-850 hover:text-sage-300"
          >
            <ArrowLeft className="rtl:-scale-x-100" size={15} aria-hidden="true" />
            {t("findings.backToWorkspace")}
          </button>
        )}
      </div>
    </div>
  );
}
