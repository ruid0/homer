export type Named = { id: number; name: string };

export type Resolution<T extends Named> =
  | { kind: "one"; match: T }
  | { kind: "many"; matches: T[] }
  | { kind: "none" };

// "salts" and "salt" are the same word. Words ending in "ss" (glass) keep it.
const singular = (word: string) => (word.length > 3 && word.endsWith("s") && !word.endsWith("ss") ? word.slice(0, -1) : word);

const words = (text: string): string[] => text.toLowerCase().split(/\s+/).filter(Boolean).map(singular);

const containsRun = (haystack: string[], needle: string[]) =>
  needle.length > 0 &&
  haystack.some((_, start) => needle.every((word, offset) => haystack[start + offset] === word));

const pick = <T extends Named>(matches: T[]): Resolution<T> => {
  const [first] = matches;
  if (first === undefined) return { kind: "none" };
  return matches.length === 1 ? { kind: "one", match: first } : { kind: "many", matches };
};

// A whole name wins. Otherwise the request must be whole words of a name ("oat" finds "Oat milk"), never the
// other way round, so "almond milk" does not quietly become "milk".
export const resolveName = <T extends Named>(query: string, candidates: readonly T[]): Resolution<T> => {
  const wanted = words(query);
  if (wanted.length === 0) return { kind: "none" };
  const exact = candidates.filter((candidate) => words(candidate.name).join(" ") === wanted.join(" "));
  if (exact.length > 0) return pick(exact);
  return pick(candidates.filter((candidate) => containsRun(words(candidate.name), wanted)));
};
