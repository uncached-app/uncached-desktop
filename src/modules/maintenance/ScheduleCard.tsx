import { CalendarClock, Repeat, ShieldCheck } from "lucide-react";
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
  return new Date(at * 1000).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * The schedule: whether the policy also runs with nobody present, and how often.
 *
 * Pro only, and absent rather than disabled on Free — a switch that cannot be
 * flipped is a control with no operation behind it. What Free sees instead is
 * the Pro panel, which says this exists.
 */
export function ScheduleCard({
  status,
  onChange,
}: {
  status: ScheduleStatus;
  onChange: (schedule: Schedule) => void;
}) {
  const { schedule } = status;
  const lastRun = when(status.lastRunAt);
  const nextRun = when(status.nextRunAt);
  const blocked =
    status.held && status.held !== "tooSoon" && status.held !== "disabled"
      ? HELD_COPY[status.held]
      : null;

  return (
    <div className="rounded-2xl border border-forest-800 bg-forest-900 p-5 shadow-xs">
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
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
            schedule.enabled ? "bg-sage-500" : "bg-forest-800"
          }`}
        >
          <span className="sr-only">Run maintenance on a schedule</span>
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-mist-100 shadow-xs transition-all ${
              schedule.enabled ? "left-[22px]" : "left-0.5"
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
        <div className="flex flex-wrap items-center gap-1">
          {INTERVAL_CHOICES.map(({ hours, label }) => {
            // Compared against the interval in force rather than the one
            // stored, so a hand-edited file shows the value the thread obeys.
            const active = status.intervalHours === hours;
            return (
              <button
                key={hours}
                type="button"
                disabled={!schedule.enabled}
                onClick={() => onChange({ ...schedule, everyHours: hours })}
                aria-pressed={active}
                className={`rounded-lg px-3 py-1.5 font-mono text-xs font-medium transition-all disabled:cursor-not-allowed disabled:opacity-40 ${
                  active
                    ? "bg-forest-800 text-mist-100 font-semibold shadow-xs"
                    : "text-mist-500 hover:bg-forest-850 hover:text-mist-100"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
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
    </div>
  );
}
