import { useLayoutEffect, useRef, useState } from "react";

/**
 * The shape of the drawing area, so the picture fills it.
 */
export function useDrawingAspect() {
  const ref = useRef<HTMLDivElement>(null);
  const [aspect, setAspect] = useState(1.6);
  // In pixels, because the drawing is laid out in its own units and a name has
  // to come out the same size on screen whatever those are worth here.
  const [height, setHeight] = useState(0);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => {
      const box = element.getBoundingClientRect();
      if (box.width <= 0 || box.height <= 0) return;
      const next = Math.round((box.width / box.height) * 20) / 20;
      setAspect((current) => (Math.abs(current - next) >= 0.05 ? next : current));
      // Whole pixels: a sub-pixel change is a re-render of the whole drawing
      // for a difference nothing could show.
      setHeight((current) => (Math.abs(current - box.height) >= 1 ? Math.round(box.height) : current));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return { ref, aspect, height };
}
