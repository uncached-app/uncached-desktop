import { AlertTriangle, Check, FolderArchive, Loader2, ShieldCheck, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { Panel } from "./panels";
import { isFreeTarget } from "../../../utils/entitlements.mjs";
import { formatBytes } from "../../../utils/format.mjs";
import { isInside, relativeTo } from "../../../utils/paths.mjs";
import type { ScanTarget } from "../../../types/scan";
import type { CleanMode } from "../../../types/settings";

/** Typed verbatim to arm permanent deletion; never translated. */
const CONFIRMATION_TOKEN = "Nuke";

/**
 * What this project holds that a build can regenerate, and the only place a
 * single one of them can be removed.
 *
 * The reclaim flow is for clearing a workspace. This is for the moment someone
 * has decided about one project and wants exactly that — which is why the
 * permanent-mode confirmation appears here too. Reclaiming from this screen
 * must never be quieter than reclaiming from any other.
 */
export function ArtifactList({
  projectPath,
  targets,
  cleanMode,
  cleaningTargetIds,
  proEnabled,
  onClean,
}: {
  projectPath: string;
  /** Every artifact the same scan found, unfiltered. */
  targets: ScanTarget[];
  cleanMode: CleanMode;
  proEnabled: boolean;
  cleaningTargetIds: Set<string>;
  /** Resolves false when the backend refused, so this can say so. */
  onClean: (targetId: string, confirmation: string | null) => Promise<boolean>;
}) {
  const { t } = useTranslation();
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);

  const permanent = cleanMode === "Permanent";
  const armed = !permanent || confirmation === CONFIRMATION_TOKEN;

  const owned = useMemo(
    () =>
      targets
        .filter((target) => isInside(target.path, projectPath))
        .sort((left, right) => right.sizeBytes - left.sizeBytes),
    [targets, projectPath],
  );

  // Summed over what a reclaim would actually take. A target still being
  // measured contributes an unknown size, not zero, and one whose size failed
  // contributes a floor — folding either into a figure printed as "total" makes
  // the panel state a number it cannot stand behind.
  const measured = useMemo(
    () => owned.filter((target) => !target.sizePending && !target.sizeHasErrors),
    [owned],
  );
  const totalArtifactBytes = useMemo(
    () => measured.reduce((sum, target) => sum + target.sizeBytes, 0),
    [measured],
  );
  const unmeasured = owned.length - measured.length;

  async function reclaim(targetId: string) {
    setError(null);
    const removed = await onClean(targetId, permanent ? confirmation : null);
    if (!removed) setError(t("workspace.artifacts.refused"));
  }

  return (
    <Panel
      title={t("workspace.artifacts.title", { count: owned.length })}
      action={
        owned.length > 0 && totalArtifactBytes > 0 ? (
          <span className="font-mono text-xs font-semibold text-sage-300">
            {t("workspace.artifacts.total", { size: formatBytes(totalArtifactBytes) })}
            {/* Named rather than folded in. The rows below already say
                "measuring..." and "partly unreadable"; a total that silently
                counted them would disagree with the list above it. */}
            {unmeasured > 0 && (
              <span className="ms-1 font-normal text-mist-500">
                · {t("workspace.artifacts.notCounted", { count: unmeasured })}
              </span>
            )}
          </span>
        ) : null
      }
    >
      {/* Permanent deletion gate */}
      {permanent && owned.length > 0 && (
        <div className="mb-4 rounded-xl border border-coral-300/40 bg-coral-300/10 p-3.5 text-xs text-mist-100">
          <div className="flex items-center gap-2 font-semibold text-coral-300">
            <AlertTriangle size={14} aria-hidden="true" />
            <span>{t("workspace.artifacts.permanent.title")}</span>
          </div>
          <p className="mt-1 text-mist-300">
            <Trans
              i18nKey="workspace.artifacts.permanent.body"
              values={{ token: CONFIRMATION_TOKEN }}
              components={{ token: <strong className="font-mono font-bold text-coral-300" /> }}
            />
          </p>
          <div className="mt-2.5 flex items-center gap-2">
            <input
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              placeholder={t("workspace.artifacts.permanent.placeholder", { token: CONFIRMATION_TOKEN })}
              className="w-44 rounded-lg border border-coral-300/40 bg-forest-950 px-3 py-1.5 font-mono text-xs text-mist-100 outline-none focus:ring-1 focus:ring-coral-300/30"
              autoComplete="off"
              spellCheck={false}
              aria-label={t("workspace.artifacts.permanent.inputLabel")}
            />
            {armed && (
              <span className="inline-flex items-center gap-1 font-mono text-[11px] font-medium text-coral-300">
                <Check size={13} strokeWidth={3} />
                {t("workspace.artifacts.permanent.armed")}
              </span>
            )}
          </div>
        </div>
      )}

      {owned.length === 0 ? (
        <div className="flex items-center gap-2.5 py-1 text-xs text-mist-500">
          <ShieldCheck size={16} className="shrink-0 text-sage-300" aria-hidden="true" />
          <p>
            {t("workspace.artifacts.empty")}
          </p>
        </div>
      ) : (
        <ul className="divide-y border-t border-forest-800">
          {owned.map((target) => {
            const name = relativeTo(target.path, projectPath);
            const cleaning = cleaningTargetIds.has(target.id);
            // The same gate the findings card applies, which this screen was
            // missing: `plan` is stamped in Rust and a Pro target on a Free
            // install is refused by `perform_clean`. Offering the button and
            // reporting the refusal afterwards is the shape of a broken app.
            const proLocked = !isFreeTarget(target) && !proEnabled;

            return (
              <li
                key={target.id}
                className="flex items-center justify-between gap-3 py-3"
              >
                <div className="flex min-w-0 flex-1 items-center gap-2.5">
                  <FolderArchive size={15} className="shrink-0 text-mist-500" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <span className="block truncate font-mono text-xs font-semibold text-mist-100">
                      {name}
                    </span>
                    <div className="mt-0.5 flex items-center gap-2 text-[10px]">
                      <span className="rounded bg-forest-850 px-1.5 py-0.5 font-mono uppercase tracking-wider text-mist-500">
                        {target.label ?? target.category}
                      </span>
                      {target.sizeHasErrors && (
                        <span className="font-mono text-coral-300">{t("workspace.artifacts.partlyUnreadable")}</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-3">
                  <span className="font-mono text-xs font-bold text-mist-100">
                    {target.sizePending ? (
                      <span className="text-mist-500 font-normal text-[11px]">{t("workspace.artifacts.measuring")}</span>
                    ) : (
                      formatBytes(target.sizeBytes)
                    )}
                  </span>

                  {target.cleanable && proLocked && (
                    <span className="font-mono text-[10px] uppercase tracking-wider text-pro-100">
                      Pro
                    </span>
                  )}

                  {target.cleanable && !proLocked && (
                    <button
                      type="button"
                      onClick={() => void reclaim(target.id)}
                      disabled={cleaning || !armed}
                      aria-label={t("workspace.artifacts.reclaim", { name })}
                      title={
                        !armed
                          ? t("workspace.artifacts.permanent.armHint", { token: CONFIRMATION_TOKEN })
                          : permanent
                            ? t("workspace.artifacts.deletePermanently")
                            : t("workspace.artifacts.moveToTrash")
                      }
                      className="grid size-7 place-items-center rounded-lg border border-forest-800 text-mist-500 transition-all hover:border-coral-300/60 hover:bg-coral-300/10 hover:text-coral-300 disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      {cleaning ? (
                        <Loader2 size={13} className="animate-spin text-sage-300" aria-hidden="true" />
                      ) : (
                        <Trash2 size={13} aria-hidden="true" />
                      )}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {error && <p className="mt-3 font-mono text-xs text-coral-300">{error}</p>}
    </Panel>
  );
}
