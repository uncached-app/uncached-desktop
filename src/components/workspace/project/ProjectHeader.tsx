import { ArrowLeft, Check, Copy } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { formatBytes } from "../../../utils/format.mjs";
import { copyText } from "../../../utils/clipboard";
import { VERDICT_PRESENTATION } from "../verdictPresentation";
import type { Footprint, Verdict, WorkspaceProject } from "../../../types/workspace";

/** Who this is, what it weighs, and the way back. */
export function ProjectHeader({
  project,
  verdict,
  footprint,
  onBack,
}: {
  project: WorkspaceProject;
  verdict: Verdict;
  footprint: Footprint | null;
  onBack: () => void;
}) {
  const { t, i18n } = useTranslation();
  const presentation = VERDICT_PRESENTATION[verdict];
  const [copied, setCopied] = useState(false);

  const reclaimableShare =
    footprint && footprint.totalBytes > 0
      ? Math.round((footprint.reclaimableBytes / footprint.totalBytes) * 100)
      : 0;

  async function handleCopyPath() {
    await copyText(project.path);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <header className="shrink-0 border-b border-forest-800 pb-5">
      {/* Back button & Breadcrumb */}
      <div className="mb-3 flex items-center gap-2 text-xs text-mist-500">
        <button
          type="button"
          onClick={onBack}
          className="group inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-mist-500 transition-colors hover:bg-forest-900 hover:text-mist-100"
        >
          <ArrowLeft size={13} className="rtl:-scale-x-100 transition-transform group-hover:-translate-x-0.5" aria-hidden="true" />
          <span>{t("workspace.project.back")}</span>
        </button>
        <span className="opacity-40">/</span>
        <span className="truncate font-mono text-[11px] text-mist-300">{project.name}</span>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-mist-100 sm:text-3xl">
              {project.name}
            </h1>
            <span className="rounded-md border border-forest-800 bg-forest-850 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-mist-300">
              {project.kind}
            </span>
            <span className={`rounded-md border px-2.5 py-0.5 text-xs font-semibold ${presentation.className}`}>
              {t(presentation.labelKey)}
            </span>
          </div>

          <div className="mt-2 flex items-center gap-2">
            <p className="truncate font-mono text-xs text-mist-500" title={project.path}>
              {project.path}
            </p>
            <button
              type="button"
              onClick={() => void handleCopyPath()}
              title={copied ? t("workspace.project.pathCopied") : t("workspace.project.copyPath")}
              aria-label={t("workspace.project.copyPath")}
              className="grid size-6 shrink-0 place-items-center rounded-md text-mist-500 transition-colors hover:bg-forest-900 hover:text-mist-100"
            >
              {copied ? <Check size={12} className="text-sage-300" /> : <Copy size={12} />}
            </button>
          </div>
        </div>

        {footprint && (
          <div className="flex shrink-0 flex-wrap items-center gap-2.5">
            {/* Every figure here is a floor when the walk could not read
                everything, so all three carry the mark rather than one. A
                partial total makes the share partial too. */}
            <MetricCard
              value={formatBytes(footprint.totalBytes)}
              label={t("workspace.project.metrics.total")}
              partial={footprint.hasErrors}
            />
            <MetricCard
              value={formatBytes(footprint.reclaimableBytes)}
              label={t("workspace.project.metrics.reclaimable")}
              accent={footprint.reclaimableBytes > 0}
              badge={
                reclaimableShare > 0
                  ? new Intl.NumberFormat(i18n.language, { style: "percent" }).format(reclaimableShare / 100)
                  : undefined
              }
              partial={footprint.hasErrors}
            />
            <MetricCard
              value={formatBytes(footprint.sourceBytes)}
              label={t("workspace.project.metrics.source")}
              partial={footprint.hasErrors}
            />
          </div>
        )}
      </div>

      {footprint?.hasErrors && (
        <p className="mt-3 text-xs leading-5 text-mist-500">
          {t("workspace.project.partial")}
        </p>
      )}
    </header>
  );
}

function MetricCard({
  value,
  label,
  accent = false,
  badge,
  partial = false,
}: {
  value: string;
  label: string;
  accent?: boolean;
  badge?: string;
  /** The walk could not read everything, so this is a floor rather than a total. */
  partial?: boolean;
}) {
  return (
    <div
      className={`flex flex-col justify-center rounded-xl border px-3.5 py-2 ${
        accent
          ? "border-sage-400/40 bg-sage-400/10"
          : "border-forest-800 bg-forest-900"
      }`}
    >
      <div className="flex items-center gap-2">
        <span
          className={`font-mono text-lg font-bold tracking-tight ${
            accent ? "text-sage-300" : "text-mist-100"
          }`}
        >
          {partial && <span className="text-sm font-semibold text-mist-500">&ge;</span>}
          {value}
        </span>
        {badge && (
          <span className="rounded bg-sage-400/20 px-1.5 py-0.5 font-mono text-[10px] font-bold text-sage-300">
            {badge}
          </span>
        )}
      </div>
      <span className={`text-[10px] font-mono uppercase tracking-wider ${accent ? "text-sage-300/80 font-medium" : "text-mist-500"}`}>
        {label}
      </span>
    </div>
  );
}
