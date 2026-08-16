import assert from "node:assert/strict";
import test from "node:test";
import {
  bindingFrom,
  conflictsIn,
  toAccelerator,
  isTyping,
  formatBinding,
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

// The platform is passed in rather than detected, so both rules are checked
// wherever this runs. Left to detection, a Mac would only ever exercise the
// Mac branch and CI only the other — each of us testing the half we are not
// shipping to. These two failed on Linux for exactly that reason.
const MAC = true;
const PC = false;

test("the key matches whichever case the browser reports it in", () => {
  // Shift makes the browser send `X`; the binding says `x` and means both.
  assert.ok(matchesBinding(press("X", { meta: true, shift: true }), "cmd+shift+x", MAC));
  assert.ok(matchesBinding(press("x", { meta: true, shift: true }), "cmd+shift+x", MAC));
  assert.ok(matchesBinding(press("X", { ctrl: true, shift: true }), "cmd+shift+x", PC));
});

test("a binding only fires with exactly its own modifiers", () => {
  assert.ok(matchesBinding(press("m", { meta: true }), "cmd+m", MAC));
  assert.ok(!matchesBinding(press("m", { meta: true, shift: true }), "cmd+m", MAC));
  assert.ok(!matchesBinding(press("m"), "cmd+m", MAC));
  assert.ok(!matchesBinding(press("n", { meta: true }), "cmd+m", MAC));
});

test("cmd is the Command key on a Mac and the Control key everywhere else", () => {
  // One binding, written once, meaning the gesture each platform actually has.
  assert.ok(matchesBinding(press("k", { meta: true }), "cmd+k", MAC));
  assert.ok(!matchesBinding(press("k", { ctrl: true }), "cmd+k", MAC));

  assert.ok(matchesBinding(press("k", { ctrl: true }), "cmd+k", PC));
  assert.ok(!matchesBinding(press("k", { meta: true }), "cmd+k", PC));
});

test("a binding reads as symbols on a Mac and as words elsewhere", () => {
  assert.equal(formatBinding("cmd+shift+x", MAC), "⇧⌘X");
  assert.equal(formatBinding("cmd+shift+x", PC), "Shift+Ctrl+X");
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

test("a recorded keystroke is written the way the file spells it", () => {
  assert.equal(bindingFrom(press("M", { meta: true, shift: true })), "cmd+shift+m");
  assert.equal(bindingFrom(press("/")), "/");
  assert.equal(bindingFrom(press("k", { ctrl: true })), "cmd+k");
});

test("holding a modifier is not a binding", () => {
  // Reaching for a chord sends a `keydown` for the modifier on its own. Taking
  // that as the answer binds every command to Command.
  for (const key of ["Meta", "Shift", "Control", "Alt", "Dead", ""]) {
    assert.equal(bindingFrom(press(key, { meta: true })), null, key);
  }
});

test("what is recorded is what will match", () => {
  // The round trip has to close on the gesture each platform actually has:
  // `bindingFrom` writes `cmd` for either physical key, and `matchesBinding`
  // reads it back as the one that exists there. Recording a Mac gesture and
  // checking it everywhere passes on a Mac and fails on CI, which says nothing
  // about the round trip and everything about where it ran.
  const onMac = bindingFrom(press("X", { meta: true, shift: true }));
  assert.ok(matchesBinding(press("X", { meta: true, shift: true }), onMac, MAC));

  const onPc = bindingFrom(press("X", { ctrl: true, shift: true }));
  assert.ok(matchesBinding(press("X", { ctrl: true, shift: true }), onPc, PC));

  // And both spell it the same in the file, which is what makes a settings
  // file written on one machine work on the other.
  assert.equal(onMac, onPc);
});
