import { calendar } from "@homer/shared";
import { assistantCopy } from "../messages";

const dayName = (weekday: number) => assistantCopy.weekdays[weekday]!;

const marks = [" (today)", " (tomorrow)"];

export const systemPrompt = (today: string): string => {
  const days = calendar(today, 7);
  return assistantCopy.prompt(
    today,
    dayName(days[0]!.weekday),
    days.map(({ date, weekday }, index) => `${dayName(weekday)} ${date}${marks[index] ?? ""}`),
  );
};
