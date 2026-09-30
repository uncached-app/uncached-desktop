import { useEffect, useMemo, useState, type ReactNode } from "react";
import { FileWarning, Loader2, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ChoiceRow } from "../components/shared/ChoiceRow";
import { ProjectDependencyGroup } from "./dependencies/ProjectDependencyGroup";
import { usePurgeFlow } from "../hooks/usePurgeFlow";
import { visibleDependencies, type Scope } from "../utils/dependencies.mjs";
import type { ProjectDependencies } from "../types/dependencies";

/**
 * Declared dependencies nothing in their project names.
 *
 * Report-only, like the catalogued locations Reclaim does not remove: every
 * row ends in a command for the reader to run, because a false positive here
 * is a broken build rather than a cache that comes back.
 */
export function DependenciesModule({ onOpenWorkspace }: { onOpenWorkspace: () => void }) {
  const { t } = useTranslation();
  const flow = usePurgeFlow();
  const projectCount = flow.index.index?.projects.length ?? 0;
  const { projects, running, error, scan, current } = flow.dependencies;
  const [scope, setScope] = useState<Scope>("high");

  useEffect(() => {
    if (projectCount > 0 && !current && !running) void scan();
  }, [projectCount, current, running, scan]);

  const visible = useMemo(
    () => visibleDependencies(projects ?? [], scope) as ProjectDependencies[],
    [projects, scope],
  );
  const unusedCount = visible.reduce(
    (sum, project) => sum + project.reports.reduce((inner, report) => inner + report.unused.length, 0),
    0,
  );
  const hasAny = (projects ?? []).some((project) => project.reports.some((report) => report.unused.length > 0));
  const unreadable = (projects ?? []).flatMap((project) => project.unreadable);

  return (
    <section aria-label={t("dependencies.module.title")} className="flex h-full w-full flex-1 flex-col overflow-hidden">
      <header className="shrink-0 border-b border-forest-800 pb-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-mist-100 sm:text-3xl">{t("dependencies.module.title")}</h1>
          <button
            type="button"
            onClick={() => void scan()}
            disabled={running || projectCount === 0}
            aria-label={running ? t("dependencies.module.readingLabel") : t("dependencies.module.readAgainLabel")}
            className="group inline-flex min-h-8.5 shrink-0 cursor-pointer items-center gap-2 rounded-xl bg-sage-400 px-3.5 text-xs font-semibold text-forest-950 shadow-xs transition-all hover:bg-sage-300 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {running ? (
              <Loader2 size={13} className="animate-spin text-forest-950" aria-hidden="true" />
            ) : (
              <RefreshCw size={13} className="text-forest-950 transition-transform duration-200 group-hover:rotate-45" aria-hidden="true" />
            )}
            <span>{running ? t("dependencies.module.reading") : t("dependencies.module.readAgain")}</span>
          </button>
        </div>
        <p className="mt-1.5 max-w-2xl text-xs text-mist-500">{t("dependencies.module.intro")}</p>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto pe-2 pt-5 pb-8 scrollbar-gutter-stable">
        {projectCount === 0 ? (
          <Notice>
            <p>{t("dependencies.module.noWorkspace")}</p>
            <button
              type="button"
              onClick={onOpenWorkspace}
              className="mt-3 inline-flex items-center rounded-lg bg-forest-800 px-2.5 py-1.5 text-xs font-medium text-mist-300 hover:bg-forest-850 hover:text-sage-300"
            >
              {t("dependencies.module.openWorkspace")}
            </button>
          </Notice>
        ) : running && !projects ? (
          <Notice>
            <span className="inline-flex items-center gap-2">
              <Loader2 size={13} className="animate-spin" aria-hidden="true" />
              {t("dependencies.module.progress", { count: projectCount })}
            </span>
          </Notice>
        ) : error ? (
          <Notice>{t("dependencies.module.failed")}</Notice>
        ) : (
          <>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-mist-300">
                <strong className="font-semibold text-mist-100">
                  {t("dependencies.module.found", { count: unusedCount })}
                </strong>{" "}
                {unusedCount > 0 && t("dependencies.module.projects", { count: visible.length })}
              </p>
              <ChoiceRow
                active={scope}
                onChange={setScope}
                options={[
                  ["high", t("dependencies.scope.high"), t("dependencies.scope.highHint")],
                  ["all", t("dependencies.scope.all"), t("dependencies.scope.allHint")],
                ]}
              />
            </div>

            {unusedCount === 0 ? (
              <Notice>{hasAny ? t("dependencies.module.noneAtThisLevel") : t("dependencies.module.none")}</Notice>
            ) : (
              <div className="grid gap-4">
                {visible.map((project) => (
                  <ProjectDependencyGroup key={project.project} project={project} />
                ))}
              </div>
            )}

            {unreadable.length > 0 && (
              <ul className="mt-4 grid gap-1">
                {unreadable.map((path) => (
                  <li key={path} className="flex items-center gap-2 font-mono text-[11px] text-mist-500">
                    <FileWarning size={12} className="shrink-0 text-confidence-medium" aria-hidden="true" />
                    <span className="truncate" title={path}>
                      {t("dependencies.module.unreadable", { path })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </section>
  );
}

function Notice({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-forest-800 bg-forest-900 p-5 text-sm text-mist-500 shadow-xs">
      {children}
    </div>
  );
}
