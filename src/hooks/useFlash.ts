import { useCallback, useEffect, useRef, useState } from "react";

/** Long enough to read, short enough not to become furniture. */
const LINGER = 3500;

/**
 * A message that says what just happened, and waits to be read.
 *
 * The countdown runs only while this window has focus, which is the whole
 * reason this is not four lines of `setTimeout` at each call site. Almost
 * everything that reports through here **opens another program** — an editor, a
 * terminal, the file manager — and that program takes the screen. A fixed timer
 * spends itself behind the window that stole focus, so the one confirmation the
 * user needed ("copied — now paste it") had already expired by the time they
 * looked back at the app. It read as a button that did nothing.
 */
export function useFlash(linger = LINGER) {
  const [flash, setFlash] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  const say = useCallback((message: string | null) => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    setFlash(message);
  }, []);

  useEffect(() => {
    if (!flash) return;

    function stop() {
      if (timer.current !== null) {
        clearTimeout(timer.current);
        timer.current = null;
      }
    }
    function start() {
      stop();
      timer.current = window.setTimeout(() => setFlash(null), linger);
    }

    if (document.hasFocus()) start();
    // Not `visibilitychange`: a window sitting behind another application is
    // still "visible" to that API, which is exactly the case this exists for.
    window.addEventListener("focus", start);
    window.addEventListener("blur", stop);
    return () => {
      stop();
      window.removeEventListener("focus", start);
      window.removeEventListener("blur", stop);
    };
  }, [flash, linger]);

  return [flash, say] as const;
}
