import { weekdayOf } from "@homer/shared";
import { assistantCopy } from "../messages";

export const systemPrompt = (today: string): string => assistantCopy.prompt(today, assistantCopy.weekdays[weekdayOf(today)]!);
