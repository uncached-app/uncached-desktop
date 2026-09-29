import { Clock, HardDrive, ShieldCheck, Trash2 } from "lucide-react";
import { Trans, useTranslation } from "react-i18next";
import { ChoiceRow } from "../../components/shared/ChoiceRow";
import { formatBytes } from "../../utils/format.mjs";
import type { MaintenancePolicy } from "../../types/maintenance";

const MB = 1024 * 1024;

const IDLE_CHOICES = [30, 60, 90, 180];

const SIZE_CHOICES: Array<{ bytes: number; label: string }> = [
  { bytes: 100 * MB, label: "100 MB" },
  { bytes: 500 * MB, label: "500 MB" },
  { bytes: 1024 * MB, label: "1 GB" },
  { bytes: 5 * 1024 * MB, label: "5 GB" },
];

/**
 * The two thresholds, structured cleanly with flat button groups and guardrails.
 */
export function PolicyCard({
  policy,
  onChange,
  matchCount,
  matchBytes,
}: {
  policy: MaintenancePolicy;
  onChange: (policy: MaintenancePolicy) => void;
  matchCount?: number;
  matchBytes?: number;
}) {
  const { t } = useTranslation();

  return (
    <div className="rounded-2xl border border-forest-800 bg-forest-900 p-5 shadow-xs transition-all">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-forest-800 pb-3">
        <div>
          <h2 className="text-sm font-semibold text-mist-100">{t("maintenance.policy.title")}</h2>
          <p className="mt-0.5 text-xs text-mist-500">
            <Trans
              i18nKey="maintenance.policy.description"
              count={policy.minIdleDays}
              values={{ size: formatBytes(policy.minBytes) }}
              components={{ strong: <span className="font-semibold text-mist-100" /> }}
            />
          </p>
        </div>
        <div className="text-end">
          <span className="font-mono text-xs font-semibold text-sage-300">
            {t("maintenance.policy.summary", {
              days: policy.minIdleDays,
              size: formatBytes(policy.minBytes),
            })}
          </span>
          {matchCount !== undefined && matchBytes !== undefined && (
            <span className="mt-0.5 block font-mono text-[10px] text-mist-500">
              {t("maintenance.policy.matches", { count: matchCount, size: formatBytes(matchBytes) })}
            </span>
          )}
        </div>
      </div>

      {/* Two thresholds, drawn by the control the rest of the app uses. Each
          was written out here with its own padding and its own active state,
          which is most of why this screen did not look like the others. */}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-mist-300">
            <Clock size={13} className="text-mist-500" aria-hidden="true" />
            <span>{t("maintenance.policy.idleLabel")}</span>
          </div>
          <ChoiceRow
            active={policy.minIdleDays}
            onChange={(days) => onChange({ ...policy, minIdleDays: days })}
            options={IDLE_CHOICES.map(
              (days) =>
                [
                  days,
                  t("maintenance.policy.idleChip", { days }),
                  t("maintenance.policy.idleChipTitle", { count: days }),
                ] as const,
            )}
          />
        </div>

        <div>
          <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-mist-300">
            <HardDrive size={13} className="text-mist-500" aria-hidden="true" />
            <span>{t("maintenance.policy.sizeLabel")}</span>
          </div>
          <ChoiceRow
            active={policy.minBytes}
            onChange={(bytes) => onChange({ ...policy, minBytes: bytes })}
            options={SIZE_CHOICES.map(
              ({ bytes, label }) =>
                [bytes, label, t("maintenance.policy.sizeChipTitle", { size: label })] as const,
            )}
          />
        </div>
      </div>

      {/* Safety Guardrails */}
      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-forest-800 pt-3 text-xs text-mist-500">
        <div className="flex items-center gap-1.5">
          <ShieldCheck size={14} className="shrink-0 text-sage-300" aria-hidden="true" />
          <span>{t("maintenance.policy.guardSynced")}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Trash2 size={13} className="shrink-0 text-mist-500" aria-hidden="true" />
          <span>{t("maintenance.policy.guardTrash")}</span>
        </div>
      </div>
    </div>
  );
}
