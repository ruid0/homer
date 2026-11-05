// A bare "1.5pm" or "6.30pm" is not a time, and "10:30 amazing" is not 10:30 am.
const timePattern = /(?<![\d.:])(?:(\d{1,2}):(\d{2})\s*(?:(am|pm)\b)?(?![\d:])|(\d{1,2})\s*(am|pm)\b)/gi;

// "9 to 10pm", "9-10pm", "between 5 and 6pm": only one end has am/pm, so the other end would be guessed.
const range = /\b\d{1,2}(?::\d{2}|\s*(?:am|pm))?\s*(?:to|until|[-–])\s*\d{1,2}\s*(?:am|pm|:)|between\s+\d.*\band\s+\d/i;

const pad = (value: number) => String(value).padStart(2, "0");

const toTime = (hour: number, minute: number, meridiem: string | undefined): string | null => {
  const suffix = meridiem?.toLowerCase();
  if (suffix !== undefined && (hour < 1 || hour > 12)) return null;
  const hours = suffix === undefined ? hour : (hour % 12) + (suffix === "pm" ? 12 : 0);
  return hours > 23 || minute > 59 ? null : `${pad(hours)}:${pad(minute)}`;
};

// The one time of day a person said ("18:00", "6pm", "6:30 pm"), or null when there is none, more than one, or a range.
export const timeInText = (text: string): string | null => {
  if (range.test(text)) return null;
  const found = [...text.matchAll(timePattern)].map((match) =>
    match[1] !== undefined ? toTime(Number(match[1]), Number(match[2]), match[3]) : toTime(Number(match[4]), 0, match[5]),
  );
  const [first, ...rest] = found;
  return first !== undefined && first !== null && rest.every((time) => time === first) ? first : null;
};

const timeField: Record<string, string> = { add_task: "dueTime", add_event: "time" };

// Whether the tool has a time of day to fill.
export const takesTime = (toolName: string) => Object.hasOwn(timeField, toolName);

const dateField: Record<string, string> = { add_task: "dueDate", add_event: "date" };

// Models drop the time from "at 18:00". When the person said exactly one time, the call has a day and no time, code puts it in.
// The caller applies this only when one call in the turn can take a time, so the time cannot belong to another call.
export const addSaidTime = (toolName: string, args: unknown, text: string): unknown => {
  const field = timeField[toolName];
  if (field === undefined || args === null || typeof args !== "object" || Array.isArray(args)) return args;
  const fields = args as Record<string, unknown>;
  const said = timeInText(text);
  const hasDay = typeof fields[dateField[toolName]!] === "string";
  const given = fields[field];
  return said === null || !hasDay || (given !== undefined && given !== null) ? args : { ...args, [field]: said };
};
