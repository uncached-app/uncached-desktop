import { useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from "react";

/**
 * From this many rows on, the list renders only the ones near the viewport.
 *
 * Below it every row is in the page, as it always was: Tab reaches each one and
 * the browser's find-in-page sees them. Above it that is the price of a list
 * that stays responsive — with 2,000 targets "select all" repainted 74,000 nodes
 * in over half a second, with 10,000 it took nearly four. A scan that finds a
 * few hundred is the normal one, and it should not change.
 */
export const WINDOWING_THRESHOLD = 150;

/** The height of an ordinary row, until the real one has been measured. */
const ESTIMATED_ROW_HEIGHT = 78;

/** Rows kept rendered beyond the edges, so a fast scroll does not show gaps. */
const OVERSCAN = 8;

function scrollParent(element: HTMLElement): HTMLElement | null {
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    const { overflowY } = getComputedStyle(parent);
    if (overflowY === "auto" || overflowY === "scroll") return parent;
  }
  return null;
}

/**
 * A long list of rows that lives inside a scrolling ancestor of the page.
 *
 * Rows are measured, not assumed: one that opens a detail is taller than its
 * neighbours and the list follows. `renderRow` must return a single element
 * that fills its width.
 */
export function VirtualTargetList<T extends { id: string }>({
  items,
  renderRow,
}: {
  items: T[];
  renderRow: (item: T, index: number) => ReactNode;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const [scroller, setScroller] = useState<HTMLElement | null>(null);
  const [margin, setMargin] = useState(0);

  // Where the list starts inside what scrolls. It moves when anything above it
  // changes height, so it is read again after every render rather than once.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const parent = scrollParent(list);
    if (parent !== scroller) setScroller(parent);
    if (!parent) return;
    const next = Math.round(
      list.getBoundingClientRect().top - parent.getBoundingClientRect().top + parent.scrollTop,
    );
    if (next !== margin) setMargin(next);
  });

  const getScrollElement = useCallback(() => scroller, [scroller]);
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    overscan: OVERSCAN,
    scrollMargin: margin,
    getItemKey: (index) => items[index].id,
  });

  return (
    <div
      ref={listRef}
      role="list"
      style={{ height: virtualizer.getTotalSize(), position: "relative" }}
    >
      {virtualizer.getVirtualItems().map((row) => (
        <div
          key={row.key}
          ref={virtualizer.measureElement}
          data-index={row.index}
          role="listitem"
          // Each row is positioned, so each is its own stacking context and a
          // later one would paint over a tooltip hanging out of an earlier one.
          className="hover:z-10 focus-within:z-10"
          aria-setsize={items.length}
          aria-posinset={row.index + 1}
          style={{
            position: "absolute",
            insetBlockStart: 0,
            insetInline: 0,
            transform: `translateY(${row.start - virtualizer.options.scrollMargin}px)`,
          }}
        >
          {renderRow(items[row.index], row.index)}
        </div>
      ))}
    </div>
  );
}
