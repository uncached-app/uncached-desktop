import { useEffect } from "react";
import type { UserTheme } from "./useThemeFiles";
import type { Appearance } from "../types/settings";

/**
 * Paints the window: the built-in light or dark, and then whatever a user's
 * theme file renames on top of it.
 *
 * A theme is partial by design, so it is applied *over* a base rather than
 * instead of one — a file naming two colours leaves the other nineteen where
 * they were, and keeps working on the release that adds a twentieth. Its own
 * tokens are set on the root element, which is the one place that beats the
 * stylesheet without touching it.
 */
export function useTheme(appearance: Appearance | undefined, custom?: UserTheme | null) {
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => paintTheme(appearance, custom ?? null);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [appearance, custom]);
}

/**
 * Paints the window once, right now.
 *
 * Separate from the hook because a theme is also worth showing before it is
 * chosen: the settings list previews whatever the pointer or the arrow keys are
 * resting on, and putting that back is the same call with the saved theme. A
 * preview that had to go through settings would be a disk write per row the
 * cursor passed over, and a list you cannot arrow through without changing
 * something.
 */
export function paintTheme(appearance: Appearance | undefined, custom: UserTheme | null) {
  const stored = (localStorage.getItem("uncached_appearance") as Appearance | null) ?? "system";
  const activeAppearance = appearance ?? stored;

  const asked =
    activeAppearance === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : activeAppearance;

  // A theme carrying only one mode decides which. Reading a file of dark
  // colours over the light stylesheet is nineteen light surfaces and two
  // dark ones, which is not the appearance anybody asked for either.
  const theme = custom ? (offeredBy(custom, asked) ?? asked) : asked;

  const root = document.documentElement;
  if (root.dataset.theme !== theme || custom !== painted) {
    crossfade(root);
  }
  painted = custom;
  root.dataset.theme = theme;

  // Cleared before it is set, or switching to a theme that names fewer
  // colours leaves the previous one's showing through the gaps.
  for (const token of TOKENS) root.style.removeProperty(`--theme-${token}`);
  for (const [token, colour] of (theme === "dark" ? custom?.dark : custom?.light) ?? []) {
    root.style.setProperty(`--theme-${token}`, colour);
  }

  if (appearance) {
    localStorage.setItem("uncached_appearance", appearance);
  }

  const favicon = document.getElementById("app-favicon") as HTMLLinkElement | null;
  if (favicon) {
    favicon.href =
      theme === "dark"
        ? "/brand/UNCACHED-ICON-LIGHT-BGDARK.svg"
        : "/brand/UNCACHED-ICON-LIGHT-BGWHITE.svg";
  }
}

/** The custom theme currently on screen, so a repaint of the same one is quiet. */
let painted: UserTheme | null = null;
let fading: ReturnType<typeof setTimeout> | undefined;

/**
 * Lets every colour on screen travel to its new value instead of jumping.
 *
 * Custom properties cannot be transitioned, so the transition goes on the
 * properties that read them — and it is switched on only for the swap. Left on
 * permanently it would put a fifth of a second between the pointer and every
 * hover in the app, which is the difference between an interface that responds
 * and one that lags.
 *
 * The timer is shared, so arrowing down a list of themes is one continuous
 * fade rather than a queue of them fighting over the same attribute.
 */
function crossfade(root: HTMLElement) {
  root.dataset.themeSwapping = "true";
  clearTimeout(fading);
  fading = setTimeout(() => delete root.dataset.themeSwapping, 260);
}

/**
 * Which mode a theme can actually paint, given the one asked for.
 *
 * `null` when it names no colours at all. A theme with both leaves the choice
 * where it was; a theme with one answers with that one whatever was asked.
 */
export function offeredBy(theme: UserTheme, asked: "light" | "dark"): "light" | "dark" | null {
  if (theme.light && theme.dark) return asked;
  if (theme.light) return "light";
  if (theme.dark) return "dark";
  return null;
}

/**
 * The tokens a theme may name, so the ones it does not name can be cleared.
 *
 * Mirrors `TOKENS` in `src-tauri/src/commands/theme.rs`, which is the side that
 * decides what a theme is allowed to say. This side only has to be able to take
 * back what it set.
 */
const TOKENS = [
  "forest-950",
  "forest-900",
  "forest-850",
  "forest-800",
  "sage-300",
  "sage-400",
  "sage-500",
  "mist-100",
  "mist-300",
  "mist-500",
  "coral-300",
  "coral-surface",
  "pro-100",
  "pro-200",
  "pro-surface",
  "confidence-high",
  "confidence-high-surface",
  "confidence-medium",
  "confidence-medium-surface",
  "confidence-review",
  "confidence-review-surface",
];
