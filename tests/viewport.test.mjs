import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_SCALE,
  MIN_SCALE,
  RESET,
  clampView,
  isMoved,
  panBy,
  zoomAt,
} from "../src/utils/viewport.mjs";

const BOX = { width: 1600, height: 1000 };

/** Where a drawing point lands on screen under a view. */
function project(view, point) {
  return { x: view.x + point.x * view.scale, y: view.y + point.y * view.scale };
}

test("zooming leaves whatever is under the pointer exactly where it was", () => {
  const pointer = { x: 400, y: 300 };
  const view = zoomAt(RESET, 1.4, pointer);

  // The drawing point that was under the pointer, projected again.
  const before = { x: (pointer.x - RESET.x) / RESET.scale, y: (pointer.y - RESET.y) / RESET.scale };
  const after = project(view, before);

  assert.ok(Math.abs(after.x - pointer.x) < 1e-9);
  assert.ok(Math.abs(after.y - pointer.y) < 1e-9);
});

test("the fixed point holds through a run of zooms, not only the first", () => {
  const pointer = { x: 250, y: 700 };
  let view = RESET;
  const target = { x: pointer.x, y: pointer.y };

  for (let step = 0; step < 8; step += 1) view = zoomAt(view, 1.2, pointer);

  const landed = project(view, target);
  assert.ok(Math.abs(landed.x - pointer.x) < 1e-6, `x drifted to ${landed.x}`);
  assert.ok(Math.abs(landed.y - pointer.y) < 1e-6, `y drifted to ${landed.y}`);
});

test("zoom stops at its limits", () => {
  let deep = RESET;
  for (let step = 0; step < 40; step += 1) deep = zoomAt(deep, 1.5, { x: 0, y: 0 });
  assert.equal(deep.scale, MAX_SCALE);

  let shallow = RESET;
  for (let step = 0; step < 40; step += 1) shallow = zoomAt(shallow, 0.7, { x: 0, y: 0 });
  assert.equal(shallow.scale, MIN_SCALE);
});

test("zooming against a limit does not walk the picture sideways", () => {
  // The bug this rules out: applying the requested factor rather than the one
  // that survived clamping, which translates on every wheel tick that changed
  // nothing.
  const pointer = { x: 900, y: 120 };
  let view = RESET;
  for (let step = 0; step < 30; step += 1) view = zoomAt(view, 1.5, pointer);
  const settled = view;
  const again = zoomAt(zoomAt(settled, 1.5, pointer), 1.5, pointer);

  assert.deepEqual(again, settled);
});

test("panning moves by exactly what it was given", () => {
  assert.deepEqual(panBy({ x: 10, y: 20, scale: 2 }, -5, 7), { x: 5, y: 27, scale: 2 });
});

test("a corner of the drawing always stays reachable", () => {
  const flung = clampView(panBy(RESET, -99999, 99999), BOX);
  const drawn = { width: BOX.width * flung.scale, height: BOX.height * flung.scale };

  // Something of it still overlaps the frame, in both directions.
  assert.ok(flung.x + drawn.width > 0, "dragged off to the left with no way back");
  assert.ok(flung.y < BOX.height, "dragged off the bottom with no way back");
});

test("clamping does not move a view that is already inside", () => {
  const view = { x: -120, y: 40, scale: 1.5 };
  assert.deepEqual(clampView(view, BOX), view);
});

test("clamping leaves the scale alone", () => {
  assert.equal(clampView(panBy(RESET, -99999, 0), BOX).scale, 1);
});

test("moved is what decides whether a reset is worth offering", () => {
  assert.equal(isMoved(RESET), false);
  assert.equal(isMoved(panBy(RESET, 1, 0)), true);
  assert.equal(isMoved(zoomAt(RESET, 1.1, { x: 0, y: 0 })), true);
});
