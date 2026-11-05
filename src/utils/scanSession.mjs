import { applyScanEvents } from "./scanBatch.mjs";

const BATCHABLE = new Set(["target", "sized", "progress"]);

/**
 * Orders the events of one scan at a time, independent of React and IPC.
 *
 * Invariants: an event is applied only while its `scanId` is the active one;
 * events that arrive before `start_scan` returns are buffered and replayed by
 * `accept`; target, size and progress events are applied once per scheduled
 * frame; a terminal event first flushes the queue, so it sees the final list.
 */
export class ScanSession {
  /**
   * @param {{
   *   schedule: (callback: () => void) => number,
   *   cancelSchedule: (handle: number) => void,
   *   onTargets: (targets: Array<{ id: string }>) => void,
   *   onProgress: (progress: object) => void,
   *   onEnd: (event: { kind: "finished" | "cancelled" | "failed", payload: any }) => void,
   * }} hooks
   */
  constructor(hooks) {
    this.hooks = hooks;
    this.activeScanId = null;
    this.generation = 0;
    this.pending = false;
    this.targets = [];
    this.buffered = [];
    this.queued = [];
    this.frame = null;
    this.pendingSizes = new Map();
  }

  /** Replaces the list. `next` may be a function of the current list. */
  commit(next) {
    const value = typeof next === "function" ? next(this.targets) : next;
    this.targets = value;
    this.hooks.onTargets(value);
  }

  /** Starts waiting for a new scan's id. Returns its generation. */
  begin() {
    this.generation += 1;
    this.activeScanId = null;
    this.pending = true;
    this.buffered = [];
    this.discardQueue();
    this.pendingSizes.clear();
    return this.generation;
  }

  /** True while `generation` is the scan still waiting for its id. */
  isWaiting(generation) {
    return this.pending && generation === this.generation;
  }

  /** Binds the id `start_scan` returned and replays what arrived before it. */
  accept(generation, scanId) {
    if (!this.isWaiting(generation)) return false;
    this.activeScanId = scanId;
    this.pending = false;
    const buffered = this.buffered;
    this.buffered = [];
    buffered.forEach((event) => this.handle(event));
    return true;
  }

  accepts(scanId) {
    return this.activeScanId === scanId;
  }

  /** Forgets the current scan. Anything still in flight is dropped. */
  stop() {
    this.generation += 1;
    this.activeScanId = null;
    this.pending = false;
    this.buffered = [];
    this.discardQueue();
    this.pendingSizes.clear();
  }

  handle(event) {
    if (this.activeScanId === null) {
      if (this.pending) this.buffered.push(event);
      return;
    }
    if (!this.accepts(event.payload.scanId)) return;

    if (BATCHABLE.has(event.kind)) {
      this.enqueue(event);
      return;
    }

    this.flush();
    if (event.kind === "finished") this.pending = false;
    else this.stop();
    this.hooks.onEnd(event);
  }

  enqueue(event) {
    this.queued.push(event);
    if (this.frame !== null) return;
    this.frame = this.hooks.schedule(() => {
      this.frame = null;
      this.flush();
    });
  }

  flush() {
    this.cancelFrame();
    const events = this.queued;
    if (events.length === 0) return;
    this.queued = [];
    const applied = applyScanEvents(this.targets, this.pendingSizes, events);
    if (applied.targets !== this.targets) this.commit(applied.targets);
    if (applied.progress) this.hooks.onProgress(applied.progress);
  }

  discardQueue() {
    this.cancelFrame();
    this.queued = [];
  }

  cancelFrame() {
    if (this.frame === null) return;
    this.hooks.cancelSchedule(this.frame);
    this.frame = null;
  }
}
