import assert from "node:assert/strict";
import test from "node:test";
import { placeMenu } from "../src/utils/menuPlacement.mjs";

const WINDOW = { viewportWidth: 1000, viewportHeight: 800 };

function place(x, y, width, height, window = WINDOW) {
  return placeMenu({ x, y, width, height, ...window });
}

test("with room below and to the right, the menu starts at the pointer", () => {
  const box = place(100, 100, 240, 300);

  assert.equal(box.left, 100);
  assert.equal(box.top, 100);
});

test("a menu that would run off the bottom opens upward instead", () => {
  const box = place(100, 700, 240, 300);

  assert.equal(box.top, 400);
  assert.equal(box.left, 100);
});

test("a menu that would run off the right opens leftward instead", () => {
  const box = place(900, 100, 240, 300);

  assert.equal(box.left, 660);
});

test("the last row of a long list still gets a whole menu", () => {
  const box = place(980, 790, 240, 300);

  assert.ok(box.left >= 0 && box.left + 240 <= 1000);
  assert.ok(box.top >= 0 && box.top + 300 <= 800);
});

test("a menu with no room on either side sits against the edge", () => {
  // Taller than the window: neither side fits, so it cannot be placed by
  // flipping. Being pushed off the top is the failure this guards.
  const box = place(400, 400, 240, 900);

  assert.equal(box.top, 8);
});

test("a menu taller than the window is capped, not cut", () => {
  const box = place(400, 400, 240, 900);

  assert.equal(box.maxHeight, 800 - 16);
});

test("the margin holds on every edge", () => {
  const box = place(0, 0, 240, 300);

  assert.equal(box.left, 0);
  assert.equal(box.top, 0);

  const cornered = place(1000, 800, 240, 300);

  assert.equal(cornered.left, 1000 - 240);
  assert.equal(cornered.top, 800 - 300);
});
