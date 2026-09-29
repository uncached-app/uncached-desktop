import { ArrowUpCircle, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { UpdateState } from "../../hooks/useUpdate";

/** What was already mentioned, so it is not mentioned again. */
const TOLD = "uncached:update-announced";

/**
 * Says once, in the corner, that there is a newer Uncached.
 *
 * The badge in the titlebar is the durable affordance — it stays until the
 * update is taken, so there is always somewhere to act from. But a small word
 * in a titlebar is something you have to already know to look for, and nobody
 * installing this app for the first time does. So the badge gets said out loud
 * exactly once.
 *
 * **Once per version, not once per launch.** A notice that returns every time
 * the app opens is a notice people learn to dismiss without reading, and the
 * next one — which might matter — is dismissed the same way. Which version has
 * been announced is remembered, so declining is a decision the app honours
 * rather than a question it asks again tomorrow.
 *
 * Still not a modal, and still nothing automatic: it does not cover the app,
 * does not take focus, and downloads nothing until asked.
 */
export function UpdateToast({
  update,
  busy,
  onOpenUpdate,
}: {
  update: UpdateState;
  busy: boolean;
  /** Opens the dialog, which is where the notes are read and the download starts. */
  onOpenUpdate: () => void;
}) {
  const { t } = useTranslation();
  const reducedMotion = useReducedMotion();
  const [dismissed, setDismissed] = useState(false);
  // What had been announced when this window opened, and only that. Read into a
  // ref rather than state on purpose: recording the announcement below must not
  // change the answer to "was this already announced", or the notice would
  // dismiss itself one render after appearing.
  const announcedBefore = useRef<string | null>(read());

  const version = update.version;

  // Not in the middle of a scan or a cleanup. Those are what the app was opened
  // for, and the news can wait for them to finish — which it does, because the
  // badge in the titlebar does not go anywhere.
  const show =
    update.stage === "available" &&
    version !== null &&
    !dismissed &&
    !busy &&
    announcedBefore.current !== version;

  // Written when it is shown, not when it is dismissed: the point is that the
  // reader saw it once, and whether they acted is their business.
  useEffect(() => {
    if (!show || !version) return;
    try {
      localStorage.setItem(TOLD, version);
    } catch {
      /* said anyway; it simply returns next launch */
    }
  }, [show, version]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          role="status"
          initial={reducedMotion ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reducedMotion ? undefined : { opacity: 0, y: 12 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="fixed bottom-6 end-6 z-50 flex max-w-sm items-start gap-3 rounded-2xl border border-forest-800 bg-forest-900 py-3 ps-3.5 pe-2.5 shadow-2xl"
        >
          <ArrowUpCircle size={16} className="mt-0.5 shrink-0 text-sage-300" aria-hidden="true" />

          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-mist-100">{t("shell.update.available", { version })}</p>
            <p className="mt-0.5 text-[11px] leading-5 text-mist-500">
              {t("shell.update.toast.body")}
            </p>

            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setDismissed(true);
                  onOpenUpdate();
                }}
                className="cursor-pointer rounded-lg bg-sage-400 px-2.5 py-1 text-[11px] font-semibold text-forest-950 transition-colors hover:bg-sage-300"
              >
                {t("shell.update.toast.whatsNew")}
              </button>
              <button
                type="button"
                onClick={() => setDismissed(true)}
                className="cursor-pointer rounded-lg px-2 py-1 text-[11px] font-medium text-mist-500 transition-colors hover:text-mist-100"
              >
                {t("shell.update.later")}
              </button>
            </div>
          </div>

          {/* Dismissing leaves the badge in the titlebar, which is why saying
              no here costs nothing: the update stays one click away. */}
          <button
            type="button"
            onClick={() => setDismissed(true)}
            aria-label={t("shell.update.toast.dismiss")}
            className="grid size-6 shrink-0 cursor-pointer place-items-center rounded-md text-mist-500 transition-colors hover:bg-forest-850 hover:text-mist-100"
          >
            <X size={13} aria-hidden="true" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** A webview with no storage is not a reason to stay silent. */
function read(): string | null {
  try {
    return localStorage.getItem(TOLD);
  } catch {
    return null;
  }
}
