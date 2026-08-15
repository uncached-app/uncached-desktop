import assert from "node:assert/strict";
import test from "node:test";
import {
  conflictsIn,
  toAccelerator,
  isTyping,
  matchesBinding,
  parseBinding,
  resolveBindings,
} from "../src/utils/keys.mjs";

function press(key, held = {}) {
  return {
    key,
    metaKey: Boolean(held.meta),
    ctrlKey: Boolean(held.ctrl),
    shiftKey: Boolean(held.shift),
    altKey: Boolean(held.alt),
  };
}

test("a binding is written the way a person would say it", () => {
  assert.deepEqual(parseBinding("cmd+shift+x"), {
    key: "x",
    cmd: true,
    ctrl: false,
    shift: true,
    alt: false,
  });
  assert.deepEqual(parseBinding("/"), { key: "/", cmd: false, ctrl: false, shift: false, alt: false });
});

test("spacing and case in a hand-edited file do not decide whether it works", () => {
  assert.deepEqual(parseBinding(" CMD + Shift + X "), parseBinding("cmd+shift+x"));
});

test("something that is not a binding is not one, rather than a crash", () => {
  // Every one of these is what a settings file looks like after somebody edits
  // it: a half-typed line, a modifier with nothing after it, a deleted value.
  for (const written of ["", "   ", "cmd+", "cmd", "+", "meta+k", null, undefined, 7]) {
    assert.equal(parseBinding(written), null, `${JSON.stringify(written)} is not a binding`);
  }
});

test("a modifier the app does not know is not silently ignored", () => {
  // `hyper+k` matching plain `k` would fire on every letter typed.
  assert.equal(parseBinding("hyper+k"), null);
});

test("the key matches whichever case the browser reports it in", () => {
  // Shift makes the browser send `X`; the binding says `x` and means both.
  assert.ok(matchesBinding(press("X", { meta: true, shift: true }), "cmd+shift+x"));
  assert.ok(matchesBinding(press("x", { meta: true, shift: true }), "cmd+shift+x"));
});

test("a binding only fires with exactly its own modifiers", () => {
  assert.ok(matchesBinding(press("m", { meta: true }), "cmd+m"));
  assert.ok(!matchesBinding(press("m", { meta: true, shift: true }), "cmd+m"));
  assert.ok(!matchesBinding(press("m"), "cmd+m"));
  assert.ok(!matchesBinding(press("n", { meta: true }), "cmd+m"));
});

test("a keystroke being typed into a field is left to the field", () => {
  // The reason this exists: `/` focuses the filter, and without it, typing a
  // path into that filter would keep re-focusing the filter.
  assert.ok(isTyping({ tagName: "INPUT" }, "/"));
  assert.ok(isTyping({ tagName: "TEXTAREA" }, "/"));
  assert.ok(isTyping({ isContentEditable: true }, "/"));
  assert.ok(!isTyping({ tagName: "DIV" }, "/"));
});

test("command-anything is never a character, so it reaches the app regardless", () => {
  assert.ok(!isTyping({ tagName: "INPUT" }, "cmd+m"));
  assert.ok(!isTyping({ tagName: "TEXTAREA" }, "ctrl+k"));
});

test("an override replaces a default, and a broken one does not", () => {
  const defaults = { palette: "cmd+k", map: "cmd+m" };

  assert.deepEqual(resolveBindings(defaults, { map: "cmd+shift+m" }), {
    palette: "cmd+k",
    map: "cmd+shift+m",
  });
  assert.deepEqual(resolveBindings(defaults, { map: "cmd+" }), defaults, "a broken override stands aside");
  assert.deepEqual(resolveBindings(defaults, undefined), defaults);
});

test("an override for a command that no longer exists is dropped, not obeyed", () => {
  // A settings file outlives the version that understood it. One stale entry
  // is not a reason to ignore the rest.
  const resolved = resolveBindings({ palette: "cmd+k" }, { palette: "cmd+p", removedLastYear: "cmd+k" });

  assert.deepEqual(resolved, { palette: "cmd+p" });
});

test("two actions on one key are reported rather than quietly resolved", () => {
  // Picking one silently is how a shortcut becomes a thing that works on some
  // screens and not others.
  assert.deepEqual(conflictsIn({ a: "cmd+k", b: "cmd+k", c: "cmd+m" }), [["a", "b"]]);
  assert.deepEqual(conflictsIn({ a: "cmd+k", b: "cmd+shift+k" }), []);
});

test("a menu accelerator is the same binding in the platform's spelling", () => {
  assert.equal(toAccelerator("cmd+shift+x"), "CmdOrCtrl+Shift+X");
  assert.equal(toAccelerator("cmd+1"), "CmdOrCtrl+1");
  assert.equal(toAccelerator("alt+enter"), "Alt+enter");
});

test("a key with no modifier is never printed beside a menu item", () => {
  // The system would claim it, and `/` would stop reaching the filter field it
  // exists to jump to — the menu taking a letter off the keyboard to advertise
  // itself.
  assert.equal(toAccelerator("/"), "");
  assert.equal(toAccelerator("nonsense+"), "");
});
