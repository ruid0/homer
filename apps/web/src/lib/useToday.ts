import { useEffect, useState } from "react";
import { localDate } from "./localDate";

const CHECK_EVERY_MS = 60_000;

// A tablet left open overnight must move to the new day without a reload.
export const useToday = (): string => {
  const [today, setToday] = useState(() => localDate(new Date()));

  useEffect(() => {
    const refresh = () => setToday(localDate(new Date()));
    const timer = window.setInterval(refresh, CHECK_EVERY_MS);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  return today;
};
