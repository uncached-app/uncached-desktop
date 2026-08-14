import { Loader2, Trash2 } from "lucide-react";
import { motion } from "motion/react";
import { useMemo, useState } from "react";
import { Panel } from "./panels";
import { formatBytes } from "../../../utils/format";
import { isInside, relativeTo } from "../../../utils/paths.mjs";
import type { ScanTarget } from "../../../types/scan";
import type { CleanMode } from "../../../types/settings";

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
  onClean,
}: {
  projectPath: string;
  /** Every artifact the same scan found, unfiltered. */
  targets: ScanTarget[];
  cleanMode: CleanMode;
  cleaningTargetIds: Set<string>;
  /** Resolves false when the backend refused, so this can say so. */
  onClean: (targetId: string, confirmation: string | null) => Promise<boolean>;
}) {
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);

  const permanent = cleanMode === "Permanent";
  const armed = !permanent || confirmation === "Nuke";

  const owned = useMemo(
    () =>
      targets
        .filter((target) => isInside(target.path, projectPath))
        .sort((left, right) => right.sizeBytes - left.sizeBytes),
    [targets, projectPath],
  );

  async function reclaim(targetId: string) {
    setError(null);
    const removed = await onClean(targetId, permanent ? confirmation : null);
    if (!removed) setError("That could not be reclaimed");
  }

  return (
    <Panel title={`Artifacts (${owned.length})`}>
      {permanent && owned.length > 0 && (
        <label className="mb-3 block text-xs text-mist-300">
          Permanent deletion is on. Type <strong className="font-mono text-coral-200">Nuke</strong> to arm
          the buttons below.
          <input
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            className="mt-2 w-full rounded-xl border border-forest-700 bg-forest-950 px-3 py-2 font-mono text-sm text-mist-100 outline-none focus:border-coral-300"
            autoComplete="off"
            spellCheck={false}
            aria-label="Permanent deletion confirmation"
          />
        </label>
      )}

      {owned.length === 0 ? (
        <p className="text-xs text-mist-500">Nothing here that a build can regenerate. The weight is source.</p>
      ) : (
        <ul className="grid gap-px overflow-hidden rounded-lg">
          {owned.map((target) => {
            const name = relativeTo(target.path, projectPath);
            const cleaning = cleaningTargetIds.has(target.id);
            return (
              <motion.li
                key={target.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center gap-3 bg-forest-950 px-3 py-2.5"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-mono text-xs text-mist-100">{name}</span>
                  <span className="font-mono text-[10px] text-mist-500">
                    {target.label ?? target.category}
                    {target.sizeHasErrors && " · partly unreadable"}
                  </span>
                </span>

                <span className="shrink-0 font-mono text-xs text-mist-300">
                  {target.sizePending ? "measuring..." : formatBytes(target.sizeBytes)}
                </span>

                {/* Absent rather than disabled for a location the catalogue
                    reports and never removes: a control the backend would
                    refuse should not be drawn at all. */}
                {target.cleanable && (
                  <button
                    type="button"
                    onClick={() => void reclaim(target.id)}
                    disabled={cleaning || !armed}
                    aria-label={`Reclaim ${name}`}
                    className="shrink-0 rounded-md p-1.5 text-mist-500 transition-colors hover:bg-forest-800 hover:text-coral-300 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {cleaning ? (
                      <Loader2 size={13} className="animate-spin" aria-hidden="true" />
                    ) : (
                      <Trash2 size={13} aria-hidden="true" />
                    )}
                  </button>
                )}
              </motion.li>
            );
          })}
        </ul>
      )}

      {error && <p className="mt-3 font-mono text-[10px] text-coral-300">{error}</p>}
    </Panel>
  );
}
