import { addDays, addMonths } from "@homer/shared";

export type LastDoneChoice = "now" | "today" | "week" | "month" | "date";

export const lastDoneChoiceValues: readonly LastDoneChoice[] = ["now", "today", "week", "month", "date"];

// The date a new job counts from. Null means "needs doing now": the job is due today.
export const lastDoneOn = (choice: LastDoneChoice, today: string, picked: string): string | null =>
  ({
    now: null,
    today,
    week: addDays(today, -7),
    month: addMonths(today, -1),
    date: picked,
  })[choice];
