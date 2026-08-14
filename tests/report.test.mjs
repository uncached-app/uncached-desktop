import assert from "node:assert/strict";
import test from "node:test";
import { RANGES, buildReport } from "../src/utils/report.mjs";

const DAY = 24 * 60 * 60 * 1000;
const GB = 1024 * 1024 * 1024;

/** Fixed so every window in these tests is the same window. */
const NOW = new Date("2026-06-15T12:00:00Z").getTime();

function event(daysAgo, bytes, overrides = {}) {
  return {
    at: new Date(NOW - daysAgo * DAY).toISOString(),
    freedBytes: bytes,
    category: "NodeModules",
    path: "/w/api/node_modules",
    workspace: "/w",
    mode: "Trash",
    trigger: "Manual",
    ...overrides,
  };
}

function report(events, options = {}) {
  return buildReport({ events, now: NOW, rangeDays: 30, ...options });
}

test("an empty history reports zero rather than nothing", () => {
  const result = report([]);

  assert.equal(result.totals.freedBytes, 0);
  assert.equal(result.totals.cleanups, 0);
  assert.equal(result.events.length, 0);
  assert.equal(result.series.length, 30, "the window exists even when nothing happened in it");
});

test("only what falls inside the window is counted", () => {
  const result = report([event(2, GB), event(45, 5 * GB)]);

  assert.equal(result.totals.freedBytes, GB);
  assert.equal(result.totals.cleanups, 1);
});

test("all time reaches back to the first cleanup", () => {
  const result = report([event(400, GB), event(1, GB)], { rangeDays: null });

  assert.equal(result.totals.cleanups, 2);
  assert.equal(result.bucket, "month", "a year of days is not a chart");
  assert.equal(result.trend, null, "there is nothing before the first cleanup to compare with");
});

test("the previous window is the same length, immediately before", () => {
  const result = report([event(1, 3 * GB), event(35, GB)]);

  assert.equal(result.totals.freedBytes, 3 * GB);
  assert.equal(result.previous.freedBytes, GB);
  assert.equal(result.trend, 2, "three times as much is a doubling of the difference");
});

test("no previous activity is not a hundred percent increase", () => {
  const result = report([event(1, GB)]);

  assert.equal(result.trend, null, "nothing to compare against is not a trend");
});

/** The empty buckets are the point: without them the chart invents a cadence. */
test("the timeline includes the days nothing happened", () => {
  const result = report([event(0, GB), event(3, GB)], { rangeDays: 7 });

  assert.equal(result.series.length, 7);
  assert.equal(result.series.filter((bucket) => bucket.bytes > 0).length, 2);
  assert.equal(
    result.series.at(-1).bytes,
    GB,
    "the newest bucket is the last one, so the chart reads left to right",
  );
});

test("a wider window switches to weeks and then to months", () => {
  assert.equal(report([], { rangeDays: 7 }).bucket, "day");
  assert.equal(report([], { rangeDays: 30 }).bucket, "day");
  assert.equal(report([], { rangeDays: 90 }).bucket, "week");
  assert.equal(report([], { rangeDays: 365 }).bucket, "month");
});

test("breakdowns rank by bytes and carry their share", () => {
  const result = report([
    event(1, 3 * GB, { category: "NodeModules" }),
    event(2, GB, { category: "CargoTarget" }),
  ]);

  const [first, second] = result.breakdowns.category;
  assert.equal(first.key, "NodeModules");
  assert.equal(first.share, 0.75);
  assert.equal(second.key, "CargoTarget");
  assert.equal(second.cleanups, 1);
});

test("a filter narrows the totals, the timeline and the event list", () => {
  const result = report(
    [event(1, 3 * GB, { category: "NodeModules" }), event(2, GB, { category: "CargoTarget" })],
    { filters: { category: "CargoTarget" } },
  );

  assert.equal(result.totals.freedBytes, GB);
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].category, "CargoTarget");
});

/**
 * A facet that vanishes once selected can only be changed by clearing it first,
 * which turns the filter bar into a dead end.
 */
test("a selected dimension still shows the values it was not filtered to", () => {
  const events = [
    event(1, 3 * GB, { category: "NodeModules" }),
    event(2, GB, { category: "CargoTarget" }),
  ];
  const result = report(events, { filters: { category: "CargoTarget" } });

  assert.deepEqual(
    result.breakdowns.category.map((row) => row.key).sort(),
    ["CargoTarget", "NodeModules"],
  );
});

test("filters compose across dimensions", () => {
  const events = [
    event(1, GB, { workspace: "/w", trigger: "Scheduled" }),
    event(1, 2 * GB, { workspace: "/other", trigger: "Scheduled" }),
    event(1, 4 * GB, { workspace: "/w", trigger: "Manual" }),
  ];
  const result = report(events, { filters: { workspace: "/w", trigger: "Scheduled" } });

  assert.equal(result.totals.freedBytes, GB);
  assert.equal(
    result.breakdowns.workspace.reduce((sum, row) => sum + row.bytes, 0),
    3 * GB,
    "the workspace facet is measured with the trigger filter applied and its own lifted",
  );
});

/** Version 1 of the log had no dimensions. Those cleanups still happened. */
test("an event with no recorded dimension groups under nothing, not under a guess", () => {
  const result = report([event(1, GB, { category: null, workspace: null, mode: null })]);

  assert.equal(result.totals.freedBytes, GB);
  assert.equal(result.breakdowns.category[0].key, null);
});

test("the event list is newest first", () => {
  const result = report([event(5, GB), event(1, 2 * GB), event(3, 3 * GB)]);

  assert.deepEqual(
    result.events.map((entry) => entry.freedBytes),
    [2 * GB, 3 * GB, GB],
  );
});

test("averages and the largest single cleanup come from the filtered set", () => {
  const result = report([event(1, 2 * GB), event(2, 4 * GB), event(40, 100 * GB)]);

  assert.equal(result.totals.largestBytes, 4 * GB);
  assert.equal(result.totals.averageBytes, 3 * GB);
  assert.equal(result.totals.activeDays, 2);
});

test("every offered range produces a report", () => {
  for (const range of RANGES) {
    const result = report([event(1, GB)], { rangeDays: range.days });
    assert.ok(result.series.length > 0, `${range.id} has a timeline`);
  }
});

/**
 * A clock that goes back an hour must not fold two days into one bucket, or
 * step a weekly timeline onto the week it just left.
 */
test("the timeline steps by calendar, across a daylight saving change", () => {
  const spring = new Date("2026-03-30T12:00:00Z").getTime();
  const events = [{ at: new Date(spring - 2 * DAY).toISOString(), freedBytes: GB }];

  for (const days of [7, 30, 90, 365]) {
    const result = buildReport({ events, now: spring, rangeDays: days });
    const starts = result.series.map((bucket) => bucket.start);
    assert.equal(new Set(starts).size, starts.length, `${days}d repeated a bucket`);
    assert.equal(
      result.series.reduce((sum, bucket) => sum + bucket.bytes, 0),
      GB,
      `${days}d dropped an event between buckets`,
    );
  }
});
