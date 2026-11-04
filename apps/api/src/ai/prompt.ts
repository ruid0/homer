import { calendar } from "@homer/shared";
import { assistantCopy } from "../messages";

const dayName = (weekday: number) => assistantCopy.weekdays[weekday]!;

export const systemPrompt = (today: string): string => {
  const days = calendar(today, 14);
  return assistantCopy.prompt(
    today,
    dayName(days[0]!.weekday),
    days.map(({ date, weekday }) => `${dayName(weekday)} ${date}`),
  );
};
