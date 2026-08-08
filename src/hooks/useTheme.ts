import { useEffect } from "react";
import type { Appearance } from "../types/settings";

export function useTheme(appearance: Appearance | undefined) {
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const stored = (localStorage.getItem("uncached_appearance") as Appearance | null) ?? "system";
      const activeAppearance = appearance ?? stored;

      const theme =
        activeAppearance === "system"
          ? media.matches
            ? "dark"
            : "light"
          : activeAppearance;

      document.documentElement.dataset.theme = theme;

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
  }, [appearance]);
}
