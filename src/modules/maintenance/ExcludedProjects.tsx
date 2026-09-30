import { useTranslation } from "react-i18next";
import type { WorkspaceProject } from "../../types/workspace";

/** Projects the user keeps out of maintenance, each with a way back in. */
export function ExcludedProjects({
  excluded,
  projects,
  onInclude,
}: {
  excluded: string[];
  projects: WorkspaceProject[];
  onInclude: (path: string) => void;
}) {
  const { t } = useTranslation();
  const nameOf = (path: string) =>
    projects.find((project) => project.path === path)?.name ?? path.split("/").filter(Boolean).pop() ?? path;

  return (
    <div className="rounded-2xl border border-forest-800 bg-forest-900 p-5 shadow-xs">
      <h2 className="text-sm font-semibold text-mist-100">{t("maintenance.excluded.title")}</h2>
      <p className="mt-0.5 text-xs text-mist-500">{t("maintenance.excluded.subtitle")}</p>
      <ul className="mt-3 divide-y divide-forest-800">
        {excluded.map((path) => (
          <li key={path} className="flex items-center justify-between gap-4 py-2">
            <span className="min-w-0 truncate font-mono text-xs font-semibold text-mist-100" title={path}>
              {nameOf(path)}
            </span>
            <button
              type="button"
              onClick={() => onInclude(path)}
              aria-label={t("maintenance.excluded.includeLabel", { name: nameOf(path) })}
              className="shrink-0 rounded-md px-2 py-1 text-[11px] font-medium text-mist-500 transition-colors hover:bg-forest-850 hover:text-mist-100"
            >
              {t("maintenance.excluded.include")}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
