import { AlertTriangle, LoaderCircle, X } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { Trans, useTranslation } from "react-i18next";
import { formatBytes } from "../../utils/format.mjs";

/** Typed verbatim to confirm a permanent delete, in every language. */
export const CONFIRMATION_WORD = "Nuke";

interface DeleteConfirmDialogProps {
  permanent: boolean;
  deleting: boolean;
  selectedCount: number;
  selectedBytes: number;
  confirmation: string;
  onConfirmationChange: (value: string) => void;
  confirmationReady: boolean;
  cleanupModeSupported: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function DeleteConfirmDialog({
  permanent,
  deleting,
  selectedCount,
  selectedBytes,
  confirmation,
  onConfirmationChange,
  confirmationReady,
  cleanupModeSupported,
  onCancel,
  onConfirm,
}: DeleteConfirmDialogProps) {
  const reducedMotion = useReducedMotion();
  const { t } = useTranslation();

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-transparent p-5 backdrop-blur-sm" role="presentation">
      <motion.div
        initial={reducedMotion ? false : { opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={reducedMotion ? undefined : { opacity: 0, scale: 0.95 }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-confirm-title"
        className="w-full max-w-md rounded-3xl border border-forest-800 bg-forest-900 p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className={`mb-3 grid size-10 place-items-center rounded-xl ${deleting ? "bg-forest-800 text-sage-300" : "bg-coral-300/10 text-coral-300"}`}>
              {deleting ? <LoaderCircle size={18} className="animate-spin" aria-hidden="true" /> : <AlertTriangle size={18} aria-hidden="true" />}
            </div>
            <h2 id="delete-confirm-title" className="text-xl font-semibold text-mist-100">
              {deleting
                ? permanent
                  ? t("findings.confirm.deleting")
                  : t("findings.confirm.moving")
                : permanent
                  ? t("findings.confirm.deletePermanently")
                  : t("findings.confirm.moveToRecycleBin")}
            </h2>
            <p className="mt-2 text-sm leading-6 text-mist-500">
              {deleting
                ? permanent
                  ? t("findings.confirm.deletingProgress", { count: selectedCount })
                  : t("findings.confirm.movingProgress", { count: selectedCount })
                : permanent
                  ? t("findings.confirm.permanentWarning", { count: selectedCount })
                  : t("findings.confirm.recycleWarning", { count: selectedCount })}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={deleting}
            className="grid size-8 place-items-center rounded-lg text-mist-500 hover:bg-forest-800 hover:text-mist-100 disabled:cursor-not-allowed disabled:opacity-30"
            aria-label={t("findings.confirm.close")}
          >
            <X size={17} aria-hidden="true" />
          </button>
        </div>
        {!deleting && <>
          <p className="mt-5 rounded-xl border border-forest-800 bg-forest-950 px-4 py-3 text-sm text-mist-300">
            <Trans
              i18nKey="findings.confirm.reclaims"
              values={{ size: formatBytes(selectedBytes) }}
              components={{ strong: <strong className="text-mist-100" /> }}
            />
          </p>
          {permanent && (
            <label className="mt-4 block text-start text-sm text-mist-300">
              <Trans
                i18nKey="findings.confirm.typeToConfirm"
                values={{ word: CONFIRMATION_WORD }}
                components={{ strong: <strong className="font-mono text-coral-300" /> }}
              />
              <input
                value={confirmation}
                onChange={(event) => onConfirmationChange(event.target.value)}
                className="mt-2 w-full rounded-xl border bg-forest-950 px-3 py-2.5 font-mono text-sm text-mist-100 outline-none focus:border-coral-300"
                autoComplete="off"
                spellCheck={false}
                aria-label={t("findings.confirm.inputLabel")}
              />
            </label>
          )}
        </>}
        <div className="mt-6 flex justify-end gap-3">
          {deleting ? <button type="button" disabled className="inline-flex items-center gap-2 rounded-xl bg-forest-800 px-4 py-2.5 text-sm font-medium text-mist-300"><LoaderCircle size={15} className="animate-spin" aria-hidden="true" /> {t("findings.confirm.cleaning")}</button> : <>
            <button
              type="button"
              onClick={onCancel}
              className="rounded-xl bg-forest-800 px-4 py-2.5 text-sm text-mist-300 hover:bg-forest-850"
            >
              {t("findings.confirm.cancel")}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={!confirmationReady || selectedCount === 0 || !cleanupModeSupported}
              className="rounded-xl bg-coral-300 px-4 py-2.5 text-sm font-semibold text-forest-950 hover:opacity-90 disabled:cursor-not-allowed"
            >
              {permanent ? t("findings.confirm.deletePermanently") : t("findings.confirm.moveToRecycleBin")}
            </button>
          </>}
        </div>
      </motion.div>
    </div>
  );
}
