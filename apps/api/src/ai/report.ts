import { toolDefinitions, weekdayOf, type ToolName } from "@homer/shared";
import { assistantCopy } from "../messages";

type Result = Record<string, unknown>;
export type DoneChange = { name: string; result: Result };

const str = (value: unknown): string => (typeof value === "string" ? value : "");
const orNull = (value: unknown): string | null => (typeof value === "string" ? value : null);
const numberOrNull = (value: unknown): number | null => (typeof value === "number" ? value : null);

const dayLabel = (date: string) => `${assistantCopy.weekdays[weekdayOf(date)]} ${date}`;

const writeTools = new Set<string>(toolDefinitions.filter((tool) => tool.writes).map((tool) => tool.name));

const taskParts = (result: Result): string[] => {
  const { report } = assistantCopy;
  const date = orNull(result.dueDate);
  const time = orNull(result.dueTime);
  const repeat = orNull(result.repeat);
  const person = orNull(result.person);
  return [
    [date === null ? report.noDate : report.forDay(dayLabel(date)), ...(time === null ? [] : [report.atTime(time)])].join(" "),
    ...(repeat === null ? [] : [report.repeating(repeat)]),
    ...(person === null ? [] : [report.forPerson(person)]),
  ];
};

const eventParts = (result: Result): string[] => {
  const { report } = assistantCopy;
  const time = orNull(result.time);
  const person = orNull(result.person);
  return [
    [report.onDay(dayLabel(str(result.date))), ...(time === null ? [] : [report.atTime(time)]), ...(person === null ? [] : [report.forPerson(person)])].join(" "),
  ];
};

// One sentence for one change, built from what the tool says it did. A change is never described in the model's words.
export const reportLine = (name: string, result: Result): string => {
  const { report } = assistantCopy;
  const known = name as ToolName;
  switch (known) {
    case "mark_out":
      return report.markOut(str(result.item));
    case "restock_item":
      return report.restock(str(result.item), numberOrNull(result.added), str(result.unit), numberOrNull(result.quantity));
    case "add_item":
      return report.addItem(str(result.item), numberOrNull(result.quantity), str(result.unit));
    case "add_to_groceries":
      return report.listed(str(result.name), numberOrNull(result.quantity));
    case "mark_bought":
      return report.bought(str(result.name), numberOrNull(result.restocked));
    case "add_task":
      return report.task(str(result.title), taskParts(result));
    case "add_event":
      return report.event(str(result.title), eventParts(result));
    case "complete_task": {
      const next = orNull(result.nextDueDate);
      return report.done(str(result.title), next === null ? null : dayLabel(next));
    }
    case "list_items":
    case "list_groceries":
    case "list_tasks":
      return "";
  }
};

// A write that did not go through, in words. Used when other calls in the same turn did, so the failure is not lost.
export const skippedLine = (result: Result): string => {
  const { skipped } = assistantCopy;
  switch (result.status) {
    case "not_tracked":
      return skipped.notTracked(str(result.name));
    case "ambiguous":
      return skipped.ambiguous(Array.isArray(result.matches) ? result.matches.map(String) : []);
    case "needs_quantity":
      return skipped.needsQuantity(str(result.name));
    case "person_not_found":
      return skipped.unknownPerson(str(result.name));
    case "not_on_list":
      return skipped.notOnList(str(result.name));
    case "not_found":
      return skipped.noTask(str(result.title));
    default:
      return str(result.message);
  }
};

export const isWriteTool = (name: string) => writeTools.has(name);

const participle = "added|marked|restocked|completed|scheduled|created|saved|recorded|removed|booked";

// First person, past tense, about a change ("I've added ...", "Added the ..."). Passive and present-tense wording is left
// alone, because "your appointment is scheduled for Thursday" is an honest answer to a question. Best effort: a model can
// always phrase a false claim some other way, which is why a change is only ever reported from the recorded result.
const claims = [
  new RegExp(`\\bI(?:'ve| have)?\\s+(?:just\\s+|now\\s+|gone ahead and\\s+)?(?:${participle}|started tracking|set up|put)\\b`, "i"),
  new RegExp(`^\\s*(?:ok(?:ay)?|sure|got it|done)[,.!]?\\s+(?:${participle})\\b`, "i"),
  new RegExp(`^\\s*(?:${participle})\\s+(?:the|a|an|it|your|\\d)`, "i"),
];

export const claimsChange = (reply: string): boolean => claims.some((claim) => claim.test(reply));

const closingQuestion = (reply: string): string | null =>
  reply
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => sentence.endsWith("?"))
    .at(-1) ?? null;

type Outcome = { done: DoneChange[]; skipped?: Result[] };

// The text for a turn. Changes are reported by code. The model's own words are used for what code cannot know: a question
// back to the person, or an answer when nothing changed.
export const composeReply = ({ done, skipped = [] }: Outcome, modelText: string): string => {
  const said = modelText.trim();
  const question = closingQuestion(said);
  if (done.length > 0) {
    const failures = skipped.map(skippedLine).filter((line) => line !== "");
    const lines = [...done.map(({ name, result }) => reportLine(name, result)), ...failures];
    return [...lines, ...(question === null || failures.length > 0 ? [] : [question])].join("\n");
  }
  if (said === "") return assistantCopy.noReply;
  if (!claimsChange(said)) return said;
  return question === null ? assistantCopy.noChange : `${assistantCopy.noChange}\n${question}`;
};

// What a turn that stopped early still has to say about the changes already made.
export const withChanges = ({ done }: Outcome, text: string): string =>
  done.length === 0 ? text : assistantCopy.doneBefore(done.map(({ name, result }) => reportLine(name, result)).join("\n"), text);
