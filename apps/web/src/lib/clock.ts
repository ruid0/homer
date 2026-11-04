import { useEffect, useState } from "react";

const pad = (value: number) => String(value).padStart(2, "0");

export const timeOfDay = (date: Date): string => `${pad(date.getHours())}:${pad(date.getMinutes())}`;

const CHECK_EVERY_MS = 30_000;

// A screen left on a wall must keep the time, and move to the new day, without a reload.
export const useClock = (): Date => {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const refresh = () => setNow(new Date());
    const timer = window.setInterval(refresh, CHECK_EVERY_MS);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  return now;
};
