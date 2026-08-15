/**
 * Key bindings, as text.
 *
 * A binding is written the way a person would say it — `cmd+shift+x`, `/`,
 * `cmd+1` — because it has to survive a round trip through a settings file
 * somebody edits by hand. Anything stricter is a format nobody can type, and
 * anything looser matches things it was not meant to.
 *
 * Pure, and tested, because every part of this is wrong in a way that looks
 * right: a modifier read from the wrong field, a comparison that is
 * case-sensitive against a key the browser reports in the other case, a binding
 * that fires while the user is typing a project name into a filter.
 */

/** What `cmd` means where this is running. Set once, read everywhere. */
const APPLE = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform ?? "");

/** Written this way in a settings file; shown as a symbol on a Mac. */
const SYMBOLS = { cmd: "⌘", shift: "⇧", alt: "⌥", ctrl: "⌃" };
const WORDS = { cmd: "Ctrl", shift: "Shift", alt: "Alt", ctrl: "Ctrl" };

/**
 * Splits a written binding into the parts a comparison needs.
 *
 * Returns `null` for anything that is not one — an empty string, a binding with
 * no key left after its modifiers. A user editing the file by hand will produce
 * both, and the answer to either is that the binding does not exist rather than
 * that the app fails to start.
 */
export function parseBinding(binding) {
  if (typeof binding !== "string") return null;
  const parts = binding
    .toLowerCase()
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;

  const key = parts[parts.length - 1];
  const modifiers = parts.slice(0, -1);
  if (key in SYMBOLS) return null;
  if (modifiers.some((modifier) => !(modifier in SYMBOLS))) return null;

  return {
    key,
    // `cmd` is Command on a Mac and Control everywhere else. One binding, and
    // the platform decides which key it names — writing `ctrl+k` in the file on
    // a Mac still means Control, for anyone who wants exactly that.
    cmd: modifiers.includes("cmd"),
    ctrl: modifiers.includes("ctrl"),
    shift: modifiers.includes("shift"),
    alt: modifiers.includes("alt"),
  };
}

/**
 * Whether a keyboard event is this binding.
 *
 * The key is compared in lower case because the browser reports `X` when shift
 * is down and `x` when it is not, and a binding written `cmd+shift+x` means the
 * same gesture either way. Digits and punctuation come through unchanged.
 */
export function matchesBinding(event, binding) {
  const parsed = typeof binding === "string" ? parseBinding(binding) : binding;
  if (!parsed) return false;

  const wanted = {
    cmd: parsed.cmd && APPLE,
    ctrl: parsed.ctrl || (parsed.cmd && !APPLE),
    shift: parsed.shift,
    alt: parsed.alt,
  };

  return (
    (event.key ?? "").toLowerCase() === parsed.key &&
    Boolean(event.metaKey) === wanted.cmd &&
    Boolean(event.ctrlKey) === wanted.ctrl &&
    Boolean(event.shiftKey) === wanted.shift &&
    Boolean(event.altKey) === wanted.alt
  );
}

/**
 * Whether a keystroke should be left alone because it is being typed.
 *
 * A filter field, a licence key, the ignore rules. An unmodified binding like
 * `/` is the whole reason this exists: without it, typing a path into the
 * search box would keep re-focusing the search box.
 *
 * A binding carrying `cmd` is exempt. Command-anything is never a character,
 * and a Mac user pressing ⌘M expects the window to react whatever has focus.
 */
export function isTyping(target, binding) {
  const parsed = typeof binding === "string" ? parseBinding(binding) : binding;
  if (parsed?.cmd || parsed?.ctrl) return false;
  if (!target || typeof target !== "object") return false;

  const tag = (target.tagName ?? "").toUpperCase();
  return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable === true;
}

/** The binding as a person reads it: symbols on a Mac, words elsewhere. */
export function formatBinding(binding) {
  const parsed = parseBinding(binding);
  if (!parsed) return "";

  const names = APPLE ? SYMBOLS : WORDS;
  const parts = [];
  if (parsed.ctrl && !(parsed.cmd && !APPLE)) parts.push(names.ctrl);
  if (parsed.alt) parts.push(names.alt);
  if (parsed.shift) parts.push(names.shift);
  if (parsed.cmd) parts.push(names.cmd);
  parts.push(label(parsed.key));

  return APPLE ? parts.join("") : parts.join("+");
}

/** What the key itself is called on screen. */
function label(key) {
  if (key.length === 1) return key.toUpperCase();
  const named = { escape: "Esc", arrowup: "↑", arrowdown: "↓", enter: "↩", " ": "Space" };
  return named[key] ?? key.replace(/^./, (first) => first.toUpperCase());
}

/**
 * The binding for each action, with the user's overrides applied.
 *
 * An override naming an action nobody offers is dropped rather than kept: a
 * settings file outlives the version that understood it, and a binding for a
 * command that no longer exists is not a reason to ignore the rest of them.
 * One that fails to parse goes the same way, and the default stands.
 */
export function resolveBindings(defaults, overrides) {
  const resolved = {};
  for (const [action, binding] of Object.entries(defaults)) {
    const override = overrides?.[action];
    resolved[action] = override && parseBinding(override) ? override : binding;
  }
  return resolved;
}

/**
 * Two actions on one key, which is a binding that does nothing predictable.
 *
 * Reported rather than resolved: the app cannot know which of them the user
 * meant, and picking one silently is how a shortcut becomes a thing that works
 * on some screens.
 */
export function conflictsIn(bindings) {
  const byKey = new Map();
  for (const [action, binding] of Object.entries(bindings)) {
    const parsed = parseBinding(binding);
    if (!parsed) continue;
    const key = `${parsed.cmd ? "c" : ""}${parsed.ctrl ? "t" : ""}${parsed.shift ? "s" : ""}${parsed.alt ? "a" : ""}:${parsed.key}`;
    byKey.set(key, [...(byKey.get(key) ?? []), action]);
  }
  return [...byKey.values()].filter((actions) => actions.length > 1);
}

/**
 * The binding in the spelling a native menu wants, or nothing.
 *
 * A modifier-less binding gets no accelerator at all. `/` printed beside a menu
 * item would be claimed by the system, and the key would stop reaching the
 * filter field it exists to jump to — the menu would have taken a letter off
 * the keyboard to advertise itself.
 */
export function toAccelerator(binding) {
  const parsed = parseBinding(binding);
  if (!parsed) return "";
  if (!parsed.cmd && !parsed.ctrl && !parsed.alt) return "";

  const parts = [];
  if (parsed.cmd) parts.push("CmdOrCtrl");
  if (parsed.ctrl && !parsed.cmd) parts.push("Ctrl");
  if (parsed.alt) parts.push("Alt");
  if (parsed.shift) parts.push("Shift");
  parts.push(parsed.key.length === 1 ? parsed.key.toUpperCase() : parsed.key);
  return parts.join("+");
}
