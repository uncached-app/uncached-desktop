import { useState } from "react";

/**
 * How many rows of a long list are shown: `initial` at first, `step` more per
 * request, back to `initial` on collapse. `remaining` is what is still hidden.
 */
export function useShowMore(total: number, initial: number, step: number) {
  const [shown, setShown] = useState(initial);
  const visible = Math.min(shown, total);
  return {
    visible,
    remaining: total - visible,
    canCollapse: visible > initial,
    showMore: () => setShown((current) => current + step),
    collapse: () => setShown(initial),
  };
}
