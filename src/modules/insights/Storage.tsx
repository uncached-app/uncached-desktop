import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatBytes } from "../../utils/format.mjs";
import type { StorageReport } from "../../types/storage";

/**
 * The disk itself, which is the frame every other number here sits in.
 *
 * The rest of this module is the app's own record: what a scan found, what a
 * cleanup took. This section is the only one that does not come from the app at
 * all — it is the filesystem's own answer, and it includes the part of the
 * volume Uncached can neither read nor remove. Somebody whose Mac says a
 * hundred and fifty gigabytes are used, and whose scan found seventeen, is not
 * looking at a broken scan, and nothing else on screen can tell them that.
 *
 * Free, whatever the plan is. A paywall in front of "how full is this disk"
 * would be charging for the question rather than for an answer.
 */
export function Storage() {
  const { t } = useTranslation();
  const [report, setReport] = useState<StorageReport | null>(null);
  const [loading, setLoading] = useState(true);

  async function read() {
    setLoading(true);
    try {
      setReport(await invoke<StorageReport | null>("storage_report"));
    } catch {
      setReport(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void read();
  }, []);

  if (report === null) {
    return loading ? null : (
      <section className="rounded-2xl border border-forest-800 bg-forest-900 p-5 shadow-xs">
        <p className="text-sm text-mist-500">{t("insights.storage.noAnswer")}</p>
      </section>
    );
  }

  const purgeable = report.purgeableBytes;
  const freeShare =
    report.totalBytes > 0 ? Math.min(100, (report.freeBytes / report.totalBytes) * 100) : 0;
  const purgeableShare =
    report.totalBytes > 0 && purgeable !== null
      ? Math.min(100 - freeShare, (purgeable / report.totalBytes) * 100)
      : 0;

  return (
    <section
      aria-labelledby="storage-title"
      className="rounded-2xl border border-forest-800 bg-forest-900 p-5 shadow-xs"
    >
      <div className="flex items-center justify-between gap-3 border-b border-forest-800 pb-3">
        <div>
          <h2 id="storage-title" className="text-sm font-semibold text-mist-100">
            {t("insights.storage.title")}
          </h2>
          <p className="mt-0.5 font-mono text-[11px] text-mist-500">{report.path}</p>
        </div>
        <button
          type="button"
          onClick={() => void read()}
          disabled={loading}
          aria-label={t("insights.storage.readAgain")}
          className="grid size-7 place-items-center rounded-lg text-mist-500 transition-colors hover:bg-forest-850 hover:text-mist-100 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loading ? (
            <Loader2 size={13} className="animate-spin" aria-hidden="true" />
          ) : (
            <RefreshCw size={13} aria-hidden="true" />
          )}
        </button>
      </div>

      {/* Used leads, because it is what a full disk is made of. Purgeable is
          drawn inside it rather than beside it: the system already counts it as
          used, and adding it to free would promise the space twice. */}
      <div
        className="mt-4 flex h-2.5 w-full overflow-hidden rounded-full bg-mist-500/40"
        role="img"
        aria-label={t("insights.storage.usedOf", {
          used: formatBytes(report.usedBytes),
          total: formatBytes(report.totalBytes),
        })}
      >
        <span className="h-full grow bg-transparent" />
        <span className="h-full bg-confidence-medium" style={{ width: `${purgeableShare}%` }} />
        <span className="h-full bg-forest-850" style={{ width: `${freeShare}%` }} />
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Figure term={t("insights.storage.capacity")} value={formatBytes(report.totalBytes)} />
        <Figure term={t("insights.storage.used")} value={formatBytes(report.usedBytes)} />
        <Figure term={t("insights.storage.free")} value={formatBytes(report.freeBytes)} />
        {purgeable !== null && (
          <Figure
            term={t("insights.storage.purgeable")}
            value={formatBytes(purgeable)}
            hint={t("insights.storage.purgeableHint")}
          />
        )}
      </dl>

      {report.fullDiskAccess === false && (
        <div className="mt-4 flex items-start gap-3 rounded-xl border border-confidence-medium/40 bg-forest-950 px-4 py-3">
          <AlertTriangle
            size={14}
            className="mt-0.5 shrink-0 text-confidence-medium"
            aria-hidden="true"
          />
          <div className="min-w-0">
            <p className="text-xs leading-5 text-mist-300">{t("insights.storage.withheld")}</p>
            <button
              type="button"
              onClick={() => void invoke("open_full_disk_access")}
              className="mt-2 inline-flex items-center rounded-lg bg-forest-800 px-2.5 py-1.5 text-xs font-medium text-mist-300 hover:bg-forest-850 hover:text-sage-300"
            >
              {t("insights.storage.openFullDiskAccess")}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function Figure({ term, value, hint }: { term: string; value: string; hint?: string }) {
  return (
    <div title={hint}>
      <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-mist-500">{term}</dt>
      <dd className="mt-1 font-mono text-lg font-bold tracking-tight text-mist-100">{value}</dd>
    </div>
  );
}
