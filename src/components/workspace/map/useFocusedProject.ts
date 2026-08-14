import { useEffect, type RefObject } from "react";

/**
 * Puts a project the user asked for in front of them.
 *
 * Showing a project means first stopping hiding it, and only the list knows
 * what is currently doing that: a text filter, a folder, a verdict, any of them
 * enough to keep the row off screen. So this drops every narrowing, waits for
 * the list to actually change, then scrolls.
 */
export function useFocusedProject({
  focusPath,
  listRef,
  visibleCount,
  onClearFilters,
  onHandled,
}: {
  focusPath: string | null;
  listRef: RefObject<HTMLDivElement | null>;
  /** Changes once the filters have cleared, which is the cue to scroll. */
  visibleCount: number;
  onClearFilters: () => void;
  onHandled: () => void;
}) {
  useEffect(() => {
    if (!focusPath) return;
    onClearFilters();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusPath]);

  // Waits on the visible list rather than running in the same pass as the
  // clearing: a row cannot be scrolled to while a filter is still hiding it.
  useEffect(() => {
    if (!focusPath) return;
    const row = listRef.current?.querySelector(`[data-path="${CSS.escape(focusPath)}"]`);
    row?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [focusPath, visibleCount, listRef]);

  // The highlight is a moment, not a state. It ends on its own whether or not
  // the row was ever found — a project that left the index between the request
  // and this render would otherwise leave the app waiting forever.
  useEffect(() => {
    if (!focusPath) return;
    const timer = setTimeout(onHandled, 2400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusPath]);
}
