import { Loader2, LockKeyhole } from "lucide-react";
import { useTranslation } from "react-i18next";
import { CommandLine } from "../../components/shared/CommandLine";
import type { ToolchainReport, ToolchainRuntime } from "../../types/toolchains";
import { openExternalUrl } from "../../utils/externalLink";
import { formatBytes } from "../../utils/format.mjs";

const RUNTIME_NAMES: Record<ToolchainRuntime, string> = {
  node: "Node.js",
  rust: "Rust",
  python: "Python",
  java: "Java",
};

const MANAGER_NAMES = {
  nvm: "nvm",
  fnm: "fnm",
  rustup: "rustup",
  pyenv: "pyenv",
  sdkman: "SDKMAN",
} as const;

/** Toolchain versions no project pins: totals on Free, each version on Pro. */
export function ToolchainSection({
  report,
  loading,
  failed,
}: {
  report: ToolchainReport | null;
  loading: boolean;
  failed: boolean;
}) {
  const { t } = useTranslation();

  return (
    <section aria-label={t("dependencies.toolchains.title")} className="mt-8 border-t border-forest-800 pt-6">
      <h2 className="text-sm font-semibold text-mist-100">{t("dependencies.toolchains.title")}</h2>
      <p className="mt-0.5 max-w-2xl text-xs text-mist-500">{t("dependencies.toolchains.intro")}</p>

      <div className="mt-4">
        {loading && !report ? (
          <p className="inline-flex items-center gap-2 text-xs text-mist-500">
            <Loader2 size={13} className="animate-spin" aria-hidden="true" />
            {t("dependencies.toolchains.reading")}
          </p>
        ) : failed ? (
          <p className="text-xs text-mist-500">{t("dependencies.toolchains.failed")}</p>
        ) : !report ? null : report.unusedCount === 0 ? (
          <p className="text-xs text-mist-500">{t("dependencies.toolchains.none")}</p>
        ) : report.locked ? (
          <div className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-pro-200/30 bg-pro-surface p-5">
            <div className="max-w-xl">
              <div className="mb-2 inline-flex items-center gap-1.5 rounded-md border border-pro-200/30 bg-forest-950 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-pro-100">
                <LockKeyhole size={11} aria-hidden="true" />
                <span>Pro</span>
              </div>
              <p className="text-sm font-semibold text-mist-100">
                {t("dependencies.toolchains.locked", {
                  count: report.unusedCount,
                  size: formatBytes(report.unusedBytes),
                })}
              </p>
              <p className="mt-1 text-xs text-mist-500">{t("dependencies.toolchains.lockedHint")}</p>
            </div>
            <button
              type="button"
              onClick={() => openExternalUrl("https://uncached.app/pro")}
              className="rounded-xl bg-pro-200 px-4 py-2.5 text-xs font-semibold text-forest-950 shadow-sm transition-opacity hover:opacity-90"
            >
              {t("dependencies.toolchains.cta")}
            </button>
          </div>
        ) : (
          <>
            <p className="mb-3 text-sm text-mist-300">
              <strong className="font-semibold text-mist-100">
                {t("dependencies.toolchains.found", {
                  count: report.unusedCount,
                  size: formatBytes(report.unusedBytes),
                })}
              </strong>
            </p>
            <ul className="grid gap-3">
              {report.unused.map((entry) => (
                <li key={entry.path} className="rounded-2xl border border-forest-800 bg-forest-900 p-4">
                  <div className="flex min-w-0 items-center justify-between gap-3">
                    <div className="min-w-0">
                      <span className="block truncate font-mono text-xs font-semibold text-mist-100" title={entry.path}>
                        {RUNTIME_NAMES[entry.runtime]} {entry.version}
                      </span>
                      <span className="text-[11px] text-mist-500">{MANAGER_NAMES[entry.manager]}</span>
                    </div>
                    <span className="shrink-0 font-mono text-xs font-bold text-mist-100">{formatBytes(entry.bytes)}</span>
                  </div>
                  <CommandLine
                    className="mt-2.5"
                    command={entry.uninstall}
                    copyLabel={t("dependencies.toolchains.copy", { version: entry.version })}
                  />
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}
