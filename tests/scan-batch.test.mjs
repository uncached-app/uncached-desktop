import test from "node:test";
import assert from "node:assert/strict";
import { applyScanEvents } from "../src/utils/scanBatch.mjs";

// The behaviour this replaces, copied from the hook as it was: one event, one
// state change. It is the oracle every batch is compared against.
function oneAtATime(targets, pendingSizes, event) {
  if (event.kind === "progress") return { targets, progress: event.payload };
  if (event.kind === "target") {
    const sizeUpdate = pendingSizes.get(event.payload.target.id);
    pendingSizes.delete(event.payload.target.id);
    const target = sizeUpdate
      ? {
          ...event.payload.target,
          sizeBytes: sizeUpdate.sizeBytes,
          lastUsedAt: sizeUpdate.lastUsedAt ?? null,
          sizeHasErrors: sizeUpdate.sizeHasErrors,
          sizePending: sizeUpdate.sizePending,
          formattedSize: sizeUpdate.formattedSize,
        }
      : event.payload.target;
    return { targets: targets.some((item) => item.id === target.id) ? targets : [...targets, target], progress: null };
  }
  if (!targets.some((target) => target.id === event.payload.targetId)) {
    pendingSizes.set(event.payload.targetId, event.payload);
    return { targets, progress: null };
  }
  return {
    targets: targets.map((target) =>
      target.id === event.payload.targetId
        ? {
            ...target,
            sizeBytes: event.payload.sizeBytes,
            lastUsedAt: event.payload.lastUsedAt ?? null,
            sizeHasErrors: event.payload.sizeHasErrors,
            sizePending: event.payload.sizePending,
            formattedSize: event.payload.formattedSize,
          }
        : target,
    ),
    progress: null,
  };
}

function replay(initial, events) {
  let targets = initial;
  let progress = null;
  const pending = new Map();
  for (const event of events) {
    const step = oneAtATime(targets, pending, event);
    targets = step.targets;
    if (step.progress) progress = step.progress;
  }
  return { targets, progress, pending };
}

const found = (id, extra = {}) => ({
  kind: "target",
  payload: { scanId: "s", target: { id, path: `/w/${id}`, name: "node_modules", sizeBytes: 0, sizePending: true, sizeHasErrors: false, lastUsedAt: null, formattedSize: "", ...extra } },
});
const sized = (id, bytes, extra = {}) => ({
  kind: "sized",
  payload: { scanId: "s", targetId: id, sizeBytes: bytes, sizePending: false, sizeHasErrors: false, formattedSize: `${bytes} B`, ...extra },
});
const progress = (n) => ({ kind: "progress", payload: { scanId: "s", directoriesScanned: n, targetsFound: 0, totalBytesFound: 0 } });

// A small deterministic generator, so a failure can be reproduced from its seed.
function random(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

function randomEvents(rand, count, ids) {
  const events = [];
  for (let i = 0; i < count; i++) {
    const id = `t${Math.floor(rand() * ids)}`;
    const roll = rand();
    if (roll < 0.35) events.push(found(id, { path: `/w/${id}/${i}` }));
    else if (roll < 0.8) events.push(sized(id, Math.floor(rand() * 1e6), rand() < 0.3 ? { lastUsedAt: Math.floor(rand() * 1e9) } : {}));
    else events.push(progress(i));
  }
  return events;
}

test("a batch does exactly what its events would have done one at a time", () => {
  for (let seed = 1; seed <= 300; seed++) {
    const rand = random(seed);
    const events = randomEvents(rand, 1 + Math.floor(rand() * 60), 1 + Math.floor(rand() * 12));
    const expected = replay([], events);

    const pending = new Map();
    const actual = applyScanEvents([], pending, events);

    assert.deepEqual(actual.targets, expected.targets, `seed ${seed}: targets`);
    assert.deepEqual(actual.progress, expected.progress, `seed ${seed}: last progress`);
    assert.deepEqual([...pending], [...expected.pending], `seed ${seed}: results still waiting for a target`);
  }
});

test("how the events are split into batches does not change the result", () => {
  for (let seed = 1; seed <= 200; seed++) {
    const rand = random(seed * 7919);
    const events = randomEvents(rand, 2 + Math.floor(rand() * 80), 1 + Math.floor(rand() * 15));
    const expected = replay([], events);

    let targets = [];
    let last = null;
    const pending = new Map();
    for (let at = 0; at < events.length; ) {
      const size = 1 + Math.floor(rand() * 9);
      const result = applyScanEvents(targets, pending, events.slice(at, at + size));
      targets = result.targets;
      if (result.progress) last = result.progress;
      at += size;
    }

    assert.deepEqual(targets, expected.targets, `seed ${seed}: targets`);
    assert.deepEqual(last, expected.progress, `seed ${seed}: last progress`);
    assert.deepEqual([...pending], [...expected.pending], `seed ${seed}: waiting results`);
  }
});

test("a size that arrives before its target is held and applied when the target comes", () => {
  const pending = new Map();
  const early = applyScanEvents([], pending, [sized("a", 500, { lastUsedAt: 7 })]);
  assert.deepEqual(early.targets, []);
  assert.equal(pending.get("a").sizeBytes, 500);

  const late = applyScanEvents(early.targets, pending, [found("a")]);
  assert.equal(late.targets.length, 1);
  assert.equal(late.targets[0].sizeBytes, 500);
  assert.equal(late.targets[0].sizePending, false);
  assert.equal(late.targets[0].lastUsedAt, 7);
  assert.equal(pending.size, 0, "nothing is left waiting once its target is listed");
});

test("a target announced twice is listed once and the first one wins", () => {
  const { targets } = applyScanEvents([], new Map(), [found("a", { path: "/first" }), found("a", { path: "/second" })]);
  assert.equal(targets.length, 1);
  assert.equal(targets[0].path, "/first");
});

test("the list it was given is never modified, and is returned as it was when nothing changed", () => {
  const original = [found("a").payload.target];
  const snapshot = JSON.parse(JSON.stringify(original));

  const same = applyScanEvents(original, new Map(), [progress(5), sized("unknown", 1)]);
  assert.equal(same.targets, original, "no change, same array");

  const changed = applyScanEvents(original, new Map(), [sized("a", 9), found("b")]);
  assert.notEqual(changed.targets, original);
  assert.deepEqual(original, snapshot, "the input was left alone");
  assert.equal(changed.targets.length, 2);
});

test("only the last progress report in a batch is kept", () => {
  const { progress: last } = applyScanEvents([], new Map(), [progress(1), progress(2), progress(3)]);
  assert.equal(last.directoriesScanned, 3);
  assert.equal(applyScanEvents([], new Map(), [found("a")]).progress, null);
});

test("two thousand events apply in well under a second", () => {
  const events = [];
  for (let i = 0; i < 2000; i++) events.push(found(`t${i}`), sized(`t${i}`, i));
  const started = process.hrtime.bigint();
  const { targets } = applyScanEvents([], new Map(), events);
  const ms = Number(process.hrtime.bigint() - started) / 1e6;
  assert.equal(targets.length, 2000);
  assert.ok(ms < 1000, `took ${ms} ms`);
});
