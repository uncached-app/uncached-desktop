import { ArrowRight, Folder } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Panel } from "./panels";

/**
 * The same repository, checked out more than once.
 *
 * Clean list view without nested card boxes.
 */
export function DuplicatePanel({ paths, onOpen }: { paths: string[]; onOpen: (path: string) => void }) {
  const { t } = useTranslation();

  return (
    <Panel
      title={t("workspace.duplicates.title", { count: paths.length })}
      action={
        <span className="font-mono text-xs font-semibold text-sage-300">
          {t("workspace.duplicates.copies", { count: paths.length })}
        </span>
      }
    >
      <div className="space-y-3">
        <p className="text-xs text-mist-500">
          {t("workspace.duplicates.intro")}
        </p>

        <div className="overflow-hidden rounded-xl border border-forest-800 bg-forest-950/60">
          <ul className="divide-y divide-forest-800/60">
            {paths.map((path) => (
              <li key={path}>
                <button
                  type="button"
                  onClick={() => onOpen(path)}
                  className="group flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-start transition-colors hover:bg-forest-900/60 cursor-pointer"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <Folder
                      size={14}
                      className="shrink-0 text-mist-500 transition-colors group-hover:text-sage-300"
                      aria-hidden="true"
                    />
                    <span className="truncate font-mono text-xs text-mist-300 transition-colors group-hover:text-mist-100">
                      {path}
                    </span>
                  </div>
                  <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-sage-300 opacity-0 transition-opacity group-hover:opacity-100">
                    <span>{t("workspace.duplicates.view")}</span>
                    <ArrowRight className="rtl:-scale-x-100" size={12} aria-hidden="true" />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Panel>
  );
}
