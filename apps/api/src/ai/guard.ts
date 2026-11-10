import type { ToolCall } from "@homer/shared";
import { assistantCopy } from "../messages";

type Refusal = Record<string, unknown>;

export type Said = {
  // Everything the person has typed on this screen, so "3" after "bought milk" still counts.
  recent: string;
  // Only the message being answered.
  now: string;
};

const wordsOf = (text: string) => text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];

// A word and its plural share a form: apple/apples, cookie/cookies, battery/batteries, glass/glasses.
const forms = (word: string) => {
  const found = new Set([word]);
  if (word.endsWith("s")) found.add(word.slice(0, -1));
  if (word.endsWith("es")) found.add(word.slice(0, -2));
  if (word.endsWith("ies")) found.add(`${word.slice(0, -3)}y`);
  if (word.endsWith("y")) found.add(`${word.slice(0, -1)}ie`);
  return found;
};

const sameWord = (first: string, second: string) => [...forms(first)].some((form) => forms(second).has(form));

const hasWord = (words: string[], word: string) => words.some((candidate) => sameWord(candidate, word));

const itemTools = new Set(["mark_out", "restock_item", "mark_bought"]);
const deleteWord = /^delet(e|es|ed|ing)$/;

// The person asked to delete this very item: it is named in the few words after "delete".
const asksToDelete = (name: string, now: string) => {
  const words = wordsOf(now);
  const at = words.findIndex((word) => deleteWord.test(word));
  if (at === -1 || (at > 0 && ["dont", "not", "never", "t"].includes(words[at - 1]!))) return false;
  const after = words.slice(at + 1, at + 5);
  return wordsOf(name).some((word) => hasWord(after, word));
};

// The model chose an item the person did not name in full, while other items share a word they did say.
// "milk" with oat milk and soy milk on the list is a question, not something to pick for them.
const chosenFromSeveral = (name: string, recent: string, known: string[]) => {
  const said = wordsOf(recent);
  if (wordsOf(name).every((word) => hasWord(said, word))) return false;
  const chosen = name.toLowerCase();
  return known.some((other) => other.toLowerCase() !== chosen && wordsOf(other).some((word) => hasWord(said, word)));
};

// Returns why a write must not run, or null when it may.
export const refuseWrite = (call: ToolCall, said: Said, known: string[]): Refusal | null => {
  if (!itemTools.has(call.name)) return null;
  const name = (call.args as { name: string }).name;
  if (call.name === "mark_out" && asksToDelete(name, said.now)) {
    return { status: "cannot_delete", message: assistantCopy.skipped.cannotDelete };
  }
  if (chosenFromSeveral(name, said.recent, known)) {
    return { status: "not_said", name, message: assistantCopy.skipped.notSaid(name) };
  }
  return null;
};
