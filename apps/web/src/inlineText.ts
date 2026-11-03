const withoutComments = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const withoutBraces = (source: string): string => {
  const next = source.replace(/\{[^{}]*\}/g, "");
  return next === source ? source : withoutBraces(next);
};

const proseLiteral = /(["'`])[A-Z][a-z]+(?:(?!\1)[^\n])*\1/g;
const jsxText = />[^<>;=|&]*[A-Za-z]{2,}[^<>;=|&]*</g;
const textAttribute = /\b(?:aria-label|placeholder|title|alt|label)=(?:"[^"]*[A-Za-z]|'[^']*[A-Za-z]|\{["'`])/g;
const visibleCall = /(?:window\.(?:confirm|alert)\(|setError\(|\bmessage:|\?\?)\s*(["'`])[^"'`\n]*[A-Za-z]/g;

// Heuristic, not a parser: TypeScript 7 has no JS compiler API. It finds capitalised string
// literals, string literals where visible text goes (confirm, setError, message, ??), text between JSX tags (also across lines and next to expressions), and text props.
export const findInlineText = (source: string, isTsx: boolean): string[] => {
  const code = withoutComments(source).replace(/^import .*$/gm, "");
  const markup = isTsx ? withoutBraces(code.replaceAll("=>", "  ")) : "";
  return [
    ...(code.match(proseLiteral) ?? []),
    ...(code.match(visibleCall) ?? []),
    ...(markup.match(jsxText) ?? []).map((text) => text.replace(/\s+/g, " ")),
    ...(code.match(textAttribute) ?? []),
  ];
};
