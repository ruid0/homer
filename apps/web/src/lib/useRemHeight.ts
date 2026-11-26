import { useLayoutEffect, useRef, useState } from "react";

// The height of an element in rem, kept current as the screen changes. The TV page scales from the screen width, so rem is
// the unit its rows are counted in. It is read before the first paint, so rows never flash in and out.
export const useRemHeight = () => {
  const ref = useRef<HTMLDivElement>(null);
  const [rem, setRem] = useState(0);
  useLayoutEffect(() => {
    const node = ref.current;
    if (node === null) return;
    const measure = () =>
      setRem(node.getBoundingClientRect().height / parseFloat(getComputedStyle(document.documentElement).fontSize));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return [ref, rem] as const;
};
