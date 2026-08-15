import { Clock, HardDrive, ShieldCheck, Trash2 } from "lucide-react";
import { formatBytes } from "../../utils/format";
import type { MaintenancePolicy } from "../../types/maintenance";

const MB = 1024 * 1024;

const IDLE_CHOICES = [
  { days: 30, label: "30 days" },
  { days: 60, label: "60 days" },
  { days: 90, label: "90 days" },
  { days: 180, label: "180 days" },
];

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
  return (
    <div className="rounded-2xl border border-forest-800 bg-forest-900 p-5 shadow-xs transition-all">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-forest-800 pb-3">
        <div>
          <h2 className="text-sm font-semibold text-mist-100">Automated Selection Policy</h2>
          <p className="mt-0.5 text-xs text-mist-500">
            Reclaim projects untouched for over{" "}
            <span className="font-semibold text-mist-100">{policy.minIdleDays} days</span> with at least{" "}
            <span className="font-semibold text-mist-100">{formatBytes(policy.minBytes)}</span> of disposable cache.
          </p>
        </div>
        <div className="text-right">
          <span className="font-mono text-xs font-semibold text-sage-300">
            &gt; {policy.minIdleDays}d · &ge; {formatBytes(policy.minBytes)}
          </span>
          {matchCount !== undefined && matchBytes !== undefined && (
            <span className="mt-0.5 block font-mono text-[10px] text-mist-500">
              {matchCount} {matchCount === 1 ? "match" : "matches"} ({formatBytes(matchBytes)})
            </span>
          )}
        </div>
      </div>

      {/* Clean parameter controls without nested card boxes */}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {/* Inactivity Threshold */}
        <div>
          <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-mist-300">
            <Clock size={13} className="text-mist-500" aria-hidden="true" />
            <span>Untouched for at least</span>
          </div>
          <div className="flex flex-wrap items-center gap-1">
            {IDLE_CHOICES.map(({ days }) => {
              const active = policy.minIdleDays === days;
              return (
                <button
                  key={days}
                  type="button"
                  onClick={() => onChange({ ...policy, minIdleDays: days })}
                  aria-pressed={active}
                  className={`rounded-lg px-3 py-1.5 font-mono text-xs font-medium transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sage-400 ${
                    active
                      ? "bg-forest-800 text-mist-100 font-semibold shadow-xs border border-forest-750"
                      : "text-mist-500 hover:bg-forest-850 hover:text-mist-100"
                  }`}
                >
                  {days}d
                </button>
              );
            })}
          </div>
        </div>

        {/* Cache Floor Threshold */}
        <div>
          <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-mist-300">
            <HardDrive size={13} className="text-mist-500" aria-hidden="true" />
            <span>Cache size at least</span>
          </div>
          <div className="flex flex-wrap items-center gap-1">
            {SIZE_CHOICES.map(({ bytes, label }) => {
              const active = policy.minBytes === bytes;
              return (
                <button
                  key={bytes}
                  type="button"
                  onClick={() => onChange({ ...policy, minBytes: bytes })}
                  aria-pressed={active}
                  className={`rounded-lg px-3 py-1.5 font-mono text-xs font-medium transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sage-400 ${
                    active
                      ? "bg-forest-800 text-mist-100 font-semibold shadow-xs border border-forest-750"
                      : "text-mist-500 hover:bg-forest-850 hover:text-mist-100"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Safety Guardrails */}
      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-forest-800 pt-3 text-xs text-mist-500">
        <div className="flex items-center gap-1.5">
          <ShieldCheck size={14} className="shrink-0 text-sage-300" aria-hidden="true" />
          <span>Only 100% remote-synced repositories are eligible</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Trash2 size={13} className="shrink-0 text-mist-500" aria-hidden="true" />
          <span>Always moves to Recycle Bin (reversible)</span>
        </div>
      </div>
    </div>
  );
}
