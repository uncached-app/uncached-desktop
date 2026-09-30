import { Eye } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ScanTarget } from "../../types/scan";
import { formatBytes } from "../../utils/format.mjs";
import { CommandLine } from "../shared/CommandLine";

export function ReportedOnlyList({ targets }: { targets: ScanTarget[] }) {
  const { t } = useTranslation();
  if (targets.length === 0) return null;

  const totalBytes = targets.reduce((sum, target) => sum + target.sizeBytes, 0);

  return (
    <section aria-labelledby="reported-only-title" className="mt-6">
      <div className="mb-2 flex items-baseline justify-between gap-3 px-1">
        <h2 id="reported-only-title" className="text-sm font-semibold text-mist-300">
          {t("findings.reportedOnly.title")}
        </h2>
        <span className="font-mono text-[11px] text-mist-500">{formatBytes(totalBytes)}</span>
      </div>
      <p className="mb-3 px-1 text-xs leading-5 text-mist-500">
        {t("findings.reportedOnly.intro")}
      </p>
      <div className="overflow-hidden rounded-2xl border border-forest-800 bg-forest-900 shadow-xs">
        {targets.map((target, position) => (
          <ReportedOnlyRow key={target.id} target={target} first={position === 0} />
        ))}
      </div>
    </section>
  );
}

function ReportedOnlyRow({ target, first }: { target: ScanTarget; first: boolean }) {
  const { t } = useTranslation();
  const command = target.reclaimWith;

  return (
    <div className={`flex flex-col gap-2 px-4 py-3 ${first ? "" : "border-t border-forest-800"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3.5">
          <span
            aria-hidden="true"
            className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border border-forest-800 text-mist-500"
          >
            <Eye size={12} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-mist-100">{target.label ?? target.name}</p>
            <p className="truncate font-mono text-[11px] text-mist-500" title={target.path}>
              {target.path}
            </p>
          </div>
        </div>
        <strong className="shrink-0 text-sm font-semibold text-mist-300">{formatBytes(target.sizeBytes)}</strong>
      </div>
      {command && (
        <CommandLine
          command={command}
          copyLabel={t("findings.reportedOnly.copyCommand", { name: target.label ?? target.name })}
          className="ms-8.5"
        />
      )}
    </div>
  );
}
