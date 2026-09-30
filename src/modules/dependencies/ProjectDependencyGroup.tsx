import { useTranslation } from "react-i18next";
import { CONFIDENCE_PRESENTATION } from "../../components/findings/confidencePresentation";
import { CommandLine } from "../../components/shared/CommandLine";
import { relativeManifest } from "../../utils/dependencies.mjs";
import type { DependencyReport, ProjectDependencies, UnusedDependency } from "../../types/dependencies";

function basename(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+$/, "").split("/").pop() ?? path;
}

function directoryOf(path: string): string {
  const normalised = path.replace(/\\/g, "/");
  return path.slice(0, normalised.lastIndexOf("/")) || path;
}

export function ProjectDependencyGroup({ project }: { project: ProjectDependencies }) {
  return (
    <section
      aria-label={basename(project.project)}
      className="overflow-hidden rounded-2xl border border-forest-800 bg-forest-900 shadow-xs"
    >
      <header className="border-b border-forest-800 px-4 py-3">
        <h2 className="text-sm font-semibold text-mist-100">{basename(project.project)}</h2>
        <p className="truncate font-mono text-[11px] text-mist-500" title={project.project}>
          {project.project}
        </p>
      </header>
      {project.reports.map((report) => (
        <ManifestSection key={report.manifest} project={project.project} report={report} />
      ))}
    </section>
  );
}

function ManifestSection({ project, report }: { project: string; report: DependencyReport }) {
  const { t } = useTranslation();
  const directory = directoryOf(report.manifest);
  return (
    <div className="border-b border-forest-800 last:border-b-0">
      <p
        className="bg-forest-950/40 px-4 py-1.5 font-mono text-[11px] text-mist-500"
        title={t("dependencies.module.runFrom", { path: directory })}
      >
        {relativeManifest(project, report.manifest)}
      </p>
      {report.unused.map((dependency, position) => (
        <DependencyRow key={dependency.name} dependency={dependency} first={position === 0} />
      ))}
    </div>
  );
}

function DependencyRow({ dependency, first }: { dependency: UnusedDependency; first: boolean }) {
  const { t } = useTranslation();
  const presentation = CONFIDENCE_PRESENTATION[dependency.confidence];
  const Icon = presentation.icon;
  return (
    <div className={`flex flex-col gap-2 px-4 py-3 ${first ? "" : "border-t border-forest-800/60"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-medium text-mist-100">{dependency.name}</span>
            {dependency.kind !== "runtime" && (
              <span className="rounded-md border border-forest-800 px-1.5 py-px font-mono text-[10px] text-mist-500">
                {t(`dependencies.kinds.${dependency.kind}`)}
              </span>
            )}
          </p>
          <p className="mt-0.5 text-xs leading-5 text-mist-500">{t(`dependencies.reasons.${dependency.reason}`)}</p>
        </div>
        <span
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium ${presentation.className}`}
        >
          <Icon size={11} aria-hidden="true" />
          {t(`findings.confidence.levels.${dependency.confidence}`)}
        </span>
      </div>
      <CommandLine
        command={dependency.removeWith}
        copyLabel={t("dependencies.module.copyCommand", { name: dependency.name })}
      />
    </div>
  );
}
