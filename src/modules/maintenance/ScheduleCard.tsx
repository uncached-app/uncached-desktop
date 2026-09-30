import { CalendarClock, HardDrive, Repeat, ShieldCheck, TriangleAlert } from "lucide-react";
import { Trans, useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { ChoiceRow } from "../../components/shared/ChoiceRow";
import type { Held, Schedule, ScheduleStatus } from "../../types/maintenance";
import { formatBytes } from "../../utils/format.mjs";

const INTERVAL_CHOICES = [
  { hours: 24, key: "daily" },
  { hours: 24 * 7, key: "weekly" },
  { hours: 24 * 14, key: "fortnightly" },
  { hours: 24 * 30, key: "monthly" },
] as const;

/** Free-space thresholds in GB; `0` stands for off and is stored as `null`. */
const LOW_DISK_CHOICES = [0, 10, 25, 50] as const;

/**
 * What the screen says instead of a next run, per reason.
 *
 * `tooSoon` is absent on purpose: it is not an obstacle, it is the schedule
 * working, and the next-run date already says it better than a sentence would.
 */
type HeldCopy = Exclude<Held, "tooSoon">;

function when(at: number | null, t: TFunction, locale: string): string | null {
  if (at === null) return null;
  const date = new Date(at * 1000);
  const dayMonth = date.toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
  });
  const time = date.toLocaleTimeString(locale, {
    hour: "2-digit",
    minute: "2-digit",
  });
  return t("maintenance.schedule.when", { date: dayMonth, time });
}

/**
 * The schedule: whether the policy also runs with nobody present, and how often.
 *
 * Pro only, and absent rather than disabled on Free — a switch that cannot be
 * flipped is a control with no operation behind it. What Free sees instead is
 * the Pro panel, which says this exists.
 */
export function ScheduleCard({
  schedule,
  status,
  onChange,
}: {
  /**
   * The stored schedule, and the only thing the switch and the chips read.
   *
   * Not `status.schedule`: that comes from a backend call this screen refreshes
   * on a timer, so rendering the controls from it made every click wait for a
   * round trip — and a click answered by the previous value looks like a
   * control that does not work.
   */
  schedule: Schedule;
  /**
   * What only the backend can answer: when the next run falls, what is holding
   * it, and whether closing the window would end it. `null` until the first
   * read lands, which is why every use of it is optional.
   */
  status: ScheduleStatus | null;
  onChange: (schedule: Schedule) => void;
}) {
  const { t, i18n } = useTranslation();
  const number = new Intl.NumberFormat(i18n.language);
  const lastRun = when(status?.lastRunAt ?? null, t, i18n.language);
  const nextRun = when(status?.nextRunAt ?? null, t, i18n.language);
  const heldCopy = (held: HeldCopy) => t(`maintenance.schedule.held.${held}`);
  const blocked =
    status?.held && status.held !== "tooSoon" && status.held !== "disabled"
      ? heldCopy(status.held)
      : null;

  return (
    <div className="rounded-2xl border border-forest-800 bg-forest-900 p-5 shadow-xs transition-all">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-forest-800 pb-3">
        <div>
          <h2 className="text-sm font-semibold text-mist-100">{t("maintenance.schedule.title")}</h2>
          <p className="mt-0.5 text-xs text-mist-500">
            {t("maintenance.schedule.subtitle")}
          </p>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={schedule.enabled}
          onClick={() => onChange({ ...schedule, enabled: !schedule.enabled })}
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage-400 ${
            schedule.enabled ? "bg-sage-400" : "bg-forest-800"
          }`}
        >
          <span className="sr-only">{t("maintenance.schedule.toggle")}</span>
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full shadow-xs transition-all ${
              schedule.enabled ? "start-[22px] bg-forest-950" : "start-0.5 bg-mist-300"
            }`}
            aria-hidden="true"
          />
        </button>
      </div>

      <div className="mt-4">
        <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-mist-300">
          <Repeat size={13} className="text-mist-500" aria-hidden="true" />
          <span>{t("maintenance.schedule.runEvery")}</span>
        </div>
        <ChoiceRow
          active={schedule.everyHours}
          disabled={!schedule.enabled}
          onChange={(hours) => onChange({ ...schedule, everyHours: hours })}
          /* Compared against what is stored, so the chip moves on the click
             rather than on the next backend read. Every choice here is inside
             the bounds the backend clamps to, so picking one makes stored and
             in-force the same number; a stored value outside them highlights
             nothing, which is the honest answer. */
          options={INTERVAL_CHOICES.map(
            ({ hours, key }) => [hours, t(`maintenance.schedule.intervals.${key}`)] as const,
          )}
        />
      </div>

      <div className="mt-4">
        <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-mist-300">
          <HardDrive size={13} className="text-mist-500" aria-hidden="true" />
          <span>{t("maintenance.schedule.lowDisk.label")}</span>
        </div>
        <ChoiceRow
          active={schedule.lowDiskGb ?? 0}
          disabled={!schedule.enabled}
          onChange={(gigabytes) => onChange({ ...schedule, lowDiskGb: gigabytes === 0 ? null : gigabytes })}
          options={LOW_DISK_CHOICES.map(
            (gigabytes) =>
              [
                gigabytes,
                gigabytes === 0
                  ? t("maintenance.schedule.lowDisk.off")
                  : t("maintenance.schedule.lowDisk.gb", { value: number.format(gigabytes) }),
              ] as const,
          )}
        />
        {status?.freeBytes != null && (
          <p className="mt-2 text-[11px] text-mist-500">
            {t("maintenance.schedule.lowDisk.now", { size: formatBytes(status.freeBytes) })}
          </p>
        )}
      </div>

      <div className="mt-4 grid gap-2 border-t border-forest-800 pt-3 text-xs text-mist-500">
        <div className="flex items-center gap-1.5">
          <CalendarClock size={14} className="shrink-0 text-mist-500" aria-hidden="true" />
          {blocked ? (
            <span>{blocked}</span>
          ) : nextRun ? (
            <span>
              <Trans
                i18nKey={lastRun ? "maintenance.schedule.nextRunWithLast" : "maintenance.schedule.nextRun"}
                values={{ next: nextRun, last: lastRun }}
                components={{ strong: <span className="font-semibold text-mist-100" /> }}
              />
            </span>
          ) : schedule.enabled ? (
            <span>{t("maintenance.schedule.dueNow")}</span>
          ) : (
            <span>{heldCopy("disabled")}</span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <ShieldCheck size={14} className="shrink-0 text-sage-300" aria-hidden="true" />
          {/* Stated because it is the whole reason this is safe to leave on. */}
          <span>
            <Trans
              i18nKey="maintenance.schedule.safety"
              components={{ strong: <span className="font-semibold text-mist-100" /> }}
            />
          </span>
        </div>
      </div>

      {/* The one combination the product can promise and not deliver. The
          schedule lives in this process, so with the app set to quit on close,
          a run only ever happens while this window is open — which is not a
          schedule. Said here, next to the switch that caused it, rather than
          left to be discovered by it never firing. */}
      {schedule.enabled && status && !status.keepsRunningInBackground && (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs leading-5 text-mist-300">
          <TriangleAlert size={14} className="mt-0.5 shrink-0 text-amber-400" aria-hidden="true" />
          <span>
            <Trans
              i18nKey="maintenance.schedule.quitWarning"
              components={{ strong: <span className="font-semibold text-mist-100" /> }}
            />
          </span>
        </div>
      )}
    </div>
  );
}
