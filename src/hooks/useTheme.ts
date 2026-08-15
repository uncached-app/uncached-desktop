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
    const apply = () => {
      const stored = (localStorage.getItem("uncached_appearance") as Appearance | null) ?? "system";
      const activeAppearance = appearance ?? stored;

      // A theme brings its own base, because a file of dark colours read over
      // the light stylesheet is nineteen light surfaces and two dark ones.
      const theme = custom
        ? custom.base
        : activeAppearance === "system"
          ? media.matches
            ? "dark"
            : "light"
          : activeAppearance;

      document.documentElement.dataset.theme = theme;

      // Cleared before it is set, or switching to a theme that names fewer
      // colours leaves the previous one's showing through the gaps.
      const root = document.documentElement;
      for (const token of TOKENS) root.style.removeProperty(`--theme-${token}`);
      for (const [token, colour] of custom?.colors ?? []) {
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
    };

    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [appearance, custom]);
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
