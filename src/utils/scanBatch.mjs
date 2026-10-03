/**
 * Applying a run of scan events to the list of targets in one pass.
 *
 * Events used to be applied one at a time, each as its own state change, and
 * each one cost a render of the whole screen: about a millisecond for a progress
 * report and several for a target, whatever the target count. The sizing workers
 * finish in bursts, so a few hundred events arrived together and the interface
 * spent seconds catching up. Applied as a batch, the same events cost one render.
 * Measured in Chromium against the production build, 600 events took 2,765 ms
 * one task at a time, 335 ms ten at a time and 93 ms fifty at a time.
 *
 * What a batch does is exactly what applying its events in order would have
 * done, which is what the tests hold it to. It does it without the quadratic
 * cost the one-at-a-time version had: each event used to scan the whole list
 * (`some` for a new target, `map` for a size), and here the list is copied once
 * and found by id.
 */

/**
 * @param {Array<{ id: string }>} targets The list as it stands. Never modified.
 * @param {Map<string, object>} pendingSizes Size results that arrived before
 *   their target did, by target id. Modified: a result is parked here when its
 *   target is unknown and taken from here when the target shows up.
 * @param {Array<{ kind: "target" | "sized" | "progress", payload: any }>} events
 *   In arrival order.
 * @returns {{ targets: Array<{ id: string }>, progress: object | null }}
 *   `targets` is the same array when nothing changed; `progress` is the last
 *   report in the batch, or null when it had none.
 */
export function applyScanEvents(targets, pendingSizes, events) {
  let next = targets;
  let positions = null;
  let progress = null;

  const own = () => {
    if (next === targets) next = targets.slice();
  };
  const find = () => {
    if (!positions) {
      positions = new Map();
      next.forEach((target, index) => positions.set(target.id, index));
    }
    return positions;
  };

  for (const event of events) {
    if (event.kind === "progress") {
      progress = event.payload;
      continue;
    }

    if (event.kind === "target") {
      const found = event.payload.target;
      // Taken whether or not the target is new: a result for a target that is
      // already listed has nothing left to wait for.
      const early = pendingSizes.get(found.id);
      pendingSizes.delete(found.id);
      if (find().has(found.id)) continue;

      own();
      next.push(
        early
          ? {
              ...found,
              sizeBytes: early.sizeBytes,
              lastUsedAt: early.lastUsedAt ?? null,
              sizeHasErrors: early.sizeHasErrors,
              sizePending: early.sizePending,
              formattedSize: early.formattedSize,
            }
          : found,
      );
      positions.set(found.id, next.length - 1);
      continue;
    }

    if (event.kind === "sized") {
      const size = event.payload;
      const at = find().get(size.targetId);
      if (at === undefined) {
        pendingSizes.set(size.targetId, size);
        continue;
      }
      own();
      next[at] = {
        ...next[at],
        sizeBytes: size.sizeBytes,
        lastUsedAt: size.lastUsedAt ?? null,
        sizeHasErrors: size.sizeHasErrors,
        sizePending: size.sizePending,
        formattedSize: size.formattedSize,
      };
    }
  }

  return { targets: next, progress };
}
