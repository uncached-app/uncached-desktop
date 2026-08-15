import { CalendarClock, Repeat, ShieldCheck, TriangleAlert } from "lucide-react";
import { ChoiceRow } from "../../components/shared/ChoiceRow";
import type { Held, Schedule, ScheduleStatus } from "../../types/maintenance";

const INTERVAL_CHOICES = [
  { hours: 24, label: "Daily" },
  { hours: 24 * 7, label: "Weekly" },
  { hours: 24 * 14, label: "Fortnightly" },
  { hours: 24 * 30, label: "Monthly" },
];

/**
 * What the screen says instead of a next run, per reason.
 *
 * `tooSoon` is absent on purpose: it is not an obstacle, it is the schedule
 * working, and the next-run date already says it better than a sentence would.
 */
const HELD_COPY: Record<Exclude<Held, "tooSoon">, string> = {
  disabled: "Turned off. Nothing runs unless you press Run now.",
  notLicensed: "Unattended runs need an active licence.",
  noWorkspace: "No folders chosen, so there is nothing to maintain.",
  scanInProgress: "Waiting for the scan that is open to finish.",
};

function when(at: number | null): string | null {
  if (at === null) return null;
  const date = new Date(at * 1000);
  const dayMonth = date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
  const time = date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${dayMonth} · ${time}`;
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
  const lastRun = when(status?.lastRunAt ?? null);
  const nextRun = when(status?.nextRunAt ?? null);
  const blocked =
    status?.held && status.held !== "tooSoon" && status.held !== "disabled"
      ? HELD_COPY[status.held]
      : null;

  return (
    <div className="rounded-2xl border border-forest-800 bg-forest-900 p-5 shadow-xs transition-all">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-forest-800 pb-3">
        <div>
          <h2 className="text-sm font-semibold text-mist-100">Unattended Schedule</h2>
          <p className="mt-0.5 text-xs text-mist-500">
            Runs the policy above without you, and tells you what it removed.
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
          <span className="sr-only">Run maintenance on a schedule</span>
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full shadow-xs transition-all ${
              schedule.enabled ? "left-[22px] bg-forest-950" : "left-0.5 bg-mist-300"
            }`}
            aria-hidden="true"
          />
        </button>
      </div>

      <div className="mt-4">
        <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-mist-300">
          <Repeat size={13} className="text-mist-500" aria-hidden="true" />
          <span>Run every</span>
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
          options={INTERVAL_CHOICES.map(({ hours, label }) => [hours, label] as const)}
        />
      </div>

      <div className="mt-4 grid gap-2 border-t border-forest-800 pt-3 text-xs text-mist-500">
        <div className="flex items-center gap-1.5">
          <CalendarClock size={14} className="shrink-0 text-mist-500" aria-hidden="true" />
          {blocked ? (
            <span>{blocked}</span>
          ) : nextRun ? (
            <span>
              Next run <span className="font-semibold text-mist-100">{nextRun}</span>
              {lastRun && <span> · last ran {lastRun}</span>}
            </span>
          ) : schedule.enabled ? (
            <span>Due now. It starts within the next few minutes.</span>
          ) : (
            <span>{HELD_COPY.disabled}</span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <ShieldCheck size={14} className="shrink-0 text-sage-300" aria-hidden="true" />
          {/* Stated because it is the whole reason this is safe to leave on. */}
          <span>
            A scheduled run obeys the same policy and moves to the Recycle Bin. It is recorded in
            Insights as <span className="font-semibold text-mist-100">A schedule</span>.
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
            Closing the window quits Uncached, so this schedule only runs while the window is open.
            Turn on <span className="font-semibold text-mist-100">Keep running in the background</span>{" "}
            in Settings to let it close to the menu bar instead.
          </span>
        </div>
      )}
    </div>
  );
}
