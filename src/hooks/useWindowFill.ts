import { useEffect } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

/**
 * Marks the document while the window fills the screen.
 *
 * The app sits inside a transparent gutter so its shadow has somewhere to fall.
 * That is right for a floating window and wrong for a maximized one, where the
 * same gutter is a strip of desktop showing through what the user asked to be
 * full size. `index.css` reads the attribute and closes the gap.
 *
 * Driven by the window's own resize event rather than by the maximize button:
 * a window is also filled by the green button, by a snap gesture and by the
 * window manager, and none of those pass through the titlebar.
 */
export function useWindowFill() {
  useEffect(() => {
    if (!isTauri()) return;
    const window = getCurrentWindow();
    let disposed = false;
    let unlisten: (() => void) | undefined;

    async function sync() {
      const [maximized, fullscreen] = await Promise.all([
        window.isMaximized(),
        window.isFullscreen(),
      ]);
      if (disposed) return;
      document.documentElement.dataset.windowFill = maximized || fullscreen ? "true" : "false";
    }

    void sync();
    void window.onResized(() => void sync()).then((dispose) => {
      if (disposed) dispose();
      else unlisten = dispose;
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);
}
