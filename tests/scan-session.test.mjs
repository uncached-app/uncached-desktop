import test from "node:test";
import assert from "node:assert/strict";
import { ScanSession } from "../src/utils/scanSession.mjs";

function harness() {
  const frames = new Map();
  let nextFrame = 1;
  const log = { targets: [], progress: [], ended: [] };
  const session = new ScanSession({
    schedule: (callback) => {
      const handle = nextFrame++;
      frames.set(handle, callback);
      return handle;
    },
    cancelSchedule: (handle) => frames.delete(handle),
    onTargets: (targets) => log.targets.push(targets),
    onProgress: (progress) => log.progress.push(progress),
    onEnd: (event) => log.ended.push(event),
  });
  const runFrames = () => {
    const pending = [...frames.values()];
    frames.clear();
    pending.forEach((callback) => callback());
  };
  return { session, log, frames, runFrames };
}

const target = (scanId, id) => ({
  kind: "target",
  payload: {
    scanId,
    target: { id, path: `/w/${id}`, name: "node_modules", sizeBytes: 0, sizePending: true, sizeHasErrors: false, lastUsedAt: null, formattedSize: "" },
  },
});
const sized = (scanId, targetId, sizeBytes) => ({
  kind: "sized",
  payload: { scanId, targetId, sizeBytes, sizePending: false, sizeHasErrors: false, lastUsedAt: null, formattedSize: `${sizeBytes} B` },
});
const progress = (scanId, scanned) => ({ kind: "progress", payload: { scanId, scanned } });
const finished = (scanId, totalTargets) => ({ kind: "finished", payload: { scanId, totalTargets, unreadable: 0 } });
const cancelled = (scanId) => ({ kind: "cancelled", payload: { scanId, totalTargets: 1 } });
const ids = (targets) => targets.map((entry) => entry.id);

test("a full scan: buffered before the id, batched per frame, flushed by finish", () => {
  const { session, log, frames, runFrames } = harness();
  const generation = session.begin();

  session.handle(target("s1", "a"));
  assert.equal(frames.size, 0, "nothing is applied before the scan has an id");

  assert.equal(session.accept(generation, "s1"), true);
  assert.equal(frames.size, 1);

  session.handle(sized("s1", "a", 10));
  session.handle(target("s1", "b"));
  session.handle(progress("s1", 5));
  assert.equal(frames.size, 1, "one frame for the whole burst");
  runFrames();

  assert.equal(log.targets.length, 1, "one commit per frame");
  assert.deepEqual(ids(session.targets), ["a", "b"]);
  assert.equal(session.targets[0].sizeBytes, 10);
  assert.deepEqual(log.progress, [{ scanId: "s1", scanned: 5 }]);

  session.handle(sized("s1", "b", 7));
  session.handle(finished("s1", 2));
  assert.equal(frames.size, 0, "the finish flushes instead of waiting for a frame");
  assert.equal(session.targets[1].sizeBytes, 7);
  assert.equal(log.ended.length, 1);
  assert.equal(log.ended[0].kind, "finished");
  assert.equal(session.pending, false);
  assert.equal(session.activeScanId, "s1");
});

test("events from another scan are ignored", () => {
  const { session, runFrames } = harness();
  session.accept(session.begin(), "s1");
  session.handle(target("old", "x"));
  session.handle(target("s1", "a"));
  runFrames();
  assert.deepEqual(ids(session.targets), ["a"]);
});

test("a size that arrives before its target is applied when the target does", () => {
  const { session, runFrames } = harness();
  session.accept(session.begin(), "s1");
  session.handle(sized("s1", "a", 42));
  session.handle(target("s1", "a"));
  runFrames();
  assert.equal(session.targets[0].sizeBytes, 42);
});

test("a superseded start is refused and its buffered events never apply", () => {
  const { session, log, runFrames } = harness();
  const first = session.begin();
  session.handle(target("s1", "a"));
  const second = session.begin();

  assert.equal(session.accept(first, "s1"), false);
  assert.equal(session.isWaiting(first), false);
  assert.equal(session.accept(second, "s2"), true);
  runFrames();
  assert.deepEqual(log.targets, []);
});

test("a cancel event drops what was queued and stops the session", () => {
  const { session, log, frames } = harness();
  session.accept(session.begin(), "s1");
  session.handle(target("s1", "a"));
  session.handle(cancelled("s1"));

  assert.equal(frames.size, 0);
  assert.equal(log.ended[0].kind, "cancelled");
  assert.equal(session.activeScanId, null);
  session.handle(target("s1", "late"));
  assert.equal(frames.size, 0, "nothing after the cancel is queued");
});

test("a failure ends the scan like a cancel", () => {
  const { session, log } = harness();
  const generation = session.begin();
  session.accept(generation, "s1");
  session.handle({ kind: "failed", payload: { scanId: "s1", error: { code: "x" } } });
  assert.equal(log.ended[0].kind, "failed");
  assert.equal(session.activeScanId, null);
  assert.notEqual(session.generation, generation);
});

test("stop discards the queue and a pending frame", () => {
  const { session, frames, log } = harness();
  session.accept(session.begin(), "s1");
  session.handle(target("s1", "a"));
  session.stop();
  assert.equal(frames.size, 0);
  assert.deepEqual(log.targets, []);
});
