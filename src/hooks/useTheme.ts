import { useEffect } from "react";
import type { Appearance } from "../types/settings";

export function useTheme(appearance: Appearance | undefined) {
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      // Before settings resolve, hold the default theme rather than probing the
      // OS: guessing dark here would flash and then correct itself.
      const theme = !appearance
        ? "light"
        : appearance === "system"
          ? (media.matches ? "dark" : "light")
          : appearance;
      document.documentElement.dataset.theme = theme;
    };

    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [appearance]);
}
