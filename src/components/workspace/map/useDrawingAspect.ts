import { useLayoutEffect, useRef, useState } from "react";

/**
 * The shape of the drawing area, so the picture fills it.
 */
export function useDrawingAspect() {
  const ref = useRef<HTMLDivElement>(null);
  const [aspect, setAspect] = useState(1.6);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => {
      const { width, height } = element.getBoundingClientRect();
      if (width > 0 && height > 0) {
        const next = Math.round((width / height) * 20) / 20;
        setAspect((current) => (Math.abs(current - next) >= 0.05 ? next : current));
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return { ref, aspect };
}
