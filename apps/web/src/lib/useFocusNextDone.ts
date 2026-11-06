import { useEffect, useState, type RefObject } from "react";

// After a Done the button that held focus moves or goes. Call the returned function once the Done has been saved and the list
// refreshed: focus lands on the next Done button in the container, or on the fallback. It runs once and then disarms.
export const useFocusNextDone = (container: RefObject<HTMLElement | null>, fallback: RefObject<HTMLElement | null>) => {
  const [wanted, setWanted] = useState(false);

  useEffect(() => {
    if (!wanted) return;
    const frame = window.requestAnimationFrame(() => {
      const next = container.current?.querySelector<HTMLElement>("[data-done-action]:not(:disabled)");
      (next ?? fallback.current)?.focus();
      setWanted(false);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [wanted, container, fallback]);

  return () => setWanted(true);
};
