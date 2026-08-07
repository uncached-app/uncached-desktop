import { useEffect } from "react";
import type { Appearance } from "../types/settings";

export function useTheme(appearance: Appearance | undefined) {
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const theme = appearance === "system" || !appearance
        ? (media.matches ? "dark" : "light")
        : appearance;
      document.documentElement.dataset.theme = theme;
    };

    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [appearance]);
}
