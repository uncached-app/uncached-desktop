// The cleanup history, read as a report.
//
// Every number here is a sum over events the native layer wrote when a target
// actually came off the disk. Nothing is modelled, projected or smoothed: a
// report that estimates is a report you cannot use to answer "did that run do
// what I think it did".
//
// Kept as a pure function over an event list so the arithmetic is testable
// without a filesystem, a window or a plan — and so the module that draws it
// has no opinions of its own about what the numbers mean.

/** The windows the report offers, and the only ones it offers. */
export const RANGES = [
  { id: "7d", label: "7 days", days: 7 },
  { id: "30d", label: "30 days", days: 30 },
  { id: "90d", label: "90 days", days: 90 },
  { id: "12m", label: "12 months", days: 365 },
  { id: "all", label: "All time", days: null },
];

/**
 * The four questions a cleanup history can answer about itself.
 *
 * They are exactly the fields recorded at the time. A dimension that would have
 * to be derived after the fact — which project, which branch — is absent here
 * because it is absent from the record, and inventing it in the reader would
 * put a number on screen that nothing measured.
 */
export const DIMENSIONS = ["category", "workspace", "trigger", "mode"];

const DAY = 24 * 60 * 60 * 1000;

/** Below a month of window, a day is a bar; past that it stops being readable. */
function bucketFor(days) {
  if (days <= 31) return "day";
  if (days <= 120) return "week";
  return "month";
}

function startOfDay(time) {
  const date = new Date(time);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function startOfWeek(time) {
  const date = new Date(startOfDay(time));
  // Monday, because a build week is not a calendar week that starts on Sunday.
  const weekday = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - weekday);
  return date.getTime();
}

function startOfMonth(time) {
  const date = new Date(time);
  return new Date(date.getFullYear(), date.getMonth(), 1).getTime();
}

function bucketStart(time, bucket) {
  if (bucket === "week") return startOfWeek(time);
  if (bucket === "month") return startOfMonth(time);
  return startOfDay(time);
}

/**
 * Steps to the next bucket by calendar, never by milliseconds.
 *
 * Adding 24 hours to a local midnight lands at 23:00 the day a clock goes back,
 * which reads as the previous bucket — a timeline that silently loses a day
 * twice a year, or spins on the same week forever.
 */
function nextBucket(time, bucket) {
  const date = new Date(time);
  if (bucket === "month") return new Date(date.getFullYear(), date.getMonth() + 1, 1).getTime();
  date.setDate(date.getDate() + (bucket === "week" ? 7 : 1));
  return date.getTime();
}

function timeOf(event) {
  return new Date(event.at).getTime();
}

/** An event missing a dimension groups under `null` rather than under a guess. */
function valueOf(event, dimension) {
  const value = event[dimension];
  return value === undefined || value === "" ? null : value;
}

function matches(event, filters) {
  return DIMENSIONS.every((dimension) => {
    const wanted = filters?.[dimension];
    return wanted === undefined || wanted === null || valueOf(event, dimension) === wanted;
  });
}

function within(events, from, to) {
  return events.filter((event) => {
    const at = timeOf(event);
    return at >= from && at < to;
  });
}

function sumBytes(events) {
  return events.reduce((total, event) => total + (event.freedBytes ?? 0), 0);
}

/**
 * Counts one dimension over a set, heaviest first.
 *
 * Deliberately computed with every filter *except* this one applied: a facet
 * that disappears the moment you select from it cannot be changed without first
 * being cleared, which is how a filter bar becomes a dead end.
 */
function breakdown(events, dimension, filters) {
  const others = { ...filters, [dimension]: null };
  const rows = new Map();
  let total = 0;
  for (const event of events) {
    if (!matches(event, others)) continue;
    const key = valueOf(event, dimension);
    const row = rows.get(key) ?? { key, bytes: 0, cleanups: 0, share: 0 };
    row.bytes += event.freedBytes ?? 0;
    row.cleanups += 1;
    rows.set(key, row);
    total += event.freedBytes ?? 0;
  }
  return [...rows.values()]
    .map((row) => ({ ...row, share: total > 0 ? row.bytes / total : 0 }))
    .sort((left, right) => right.bytes - left.bytes || right.cleanups - left.cleanups);
}

/**
 * Fills the timeline, including the buckets where nothing happened.
 *
 * The empty ones are the point. A chart drawn only from the days that have
 * events reads as constant activity, whatever the real cadence was.
 */
function series(events, from, to, bucket) {
  const buckets = new Map();
  for (let start = bucketStart(from, bucket); start < to; start = nextBucket(start, bucket)) {
    buckets.set(start, { start: new Date(start).toISOString(), bytes: 0, cleanups: 0 });
  }
  for (const event of events) {
    const entry = buckets.get(bucketStart(timeOf(event), bucket));
    if (!entry) continue;
    entry.bytes += event.freedBytes ?? 0;
    entry.cleanups += 1;
  }
  return [...buckets.values()];
}

/**
 * Builds the whole report for one window and one set of filters.
 *
 * `now` is injected rather than read so a test can assert on a fixed timeline,
 * and so the window cannot shift between the chart and the table beneath it.
 */
export function buildReport({ events = [], now = Date.now(), rangeDays = 30, filters = {} } = {}) {
  const to = now + 1;
  const earliest = events.length > 0 ? Math.min(...events.map(timeOf)) : now;
  const from = rangeDays === null ? startOfDay(earliest) : startOfDay(now - (rangeDays - 1) * DAY);
  const spanDays = Math.max(1, Math.ceil((to - from) / DAY));
  const bucket = bucketFor(spanDays);

  const inWindow = within(events, from, to);
  const filtered = inWindow.filter((event) => matches(event, filters));

  // The window immediately before this one, same length. Absent for all-time,
  // where there is nothing before the first cleanup to compare against.
  const previousEvents =
    rangeDays === null ? [] : within(events, from - spanDays * DAY, from).filter((event) => matches(event, filters));
  const previousBytes = sumBytes(previousEvents);
  const bytes = sumBytes(filtered);

  const breakdowns = {};
  for (const dimension of DIMENSIONS) breakdowns[dimension] = breakdown(inWindow, dimension, filters);

  const activeBuckets = new Set(filtered.map((event) => startOfDay(timeOf(event))));

  return {
    window: { from: new Date(from).toISOString(), to: new Date(now).toISOString(), days: spanDays },
    bucket,
    totals: {
      freedBytes: bytes,
      cleanups: filtered.length,
      activeDays: activeBuckets.size,
      largestBytes: filtered.reduce((most, event) => Math.max(most, event.freedBytes ?? 0), 0),
      averageBytes: filtered.length > 0 ? Math.round(bytes / filtered.length) : 0,
      perDayBytes: Math.round(bytes / spanDays),
    },
    previous: { freedBytes: previousBytes, cleanups: previousEvents.length },
    // Null rather than zero when there is no previous window to compare with:
    // "no change" and "nothing to compare" are different answers.
    trend: rangeDays === null || previousBytes === 0 ? null : (bytes - previousBytes) / previousBytes,
    series: series(filtered, from, to, bucket),
    breakdowns,
    events: [...filtered].sort((left, right) => timeOf(right) - timeOf(left)),
  };
}
