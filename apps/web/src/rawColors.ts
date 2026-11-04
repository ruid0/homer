const utilities =
  "text|bg|border(?:-[trblxyse])?|outline|ring|ring-offset|inset-ring|divide|fill|stroke|decoration|placeholder|caret|accent|shadow|from|via|to";
const palette =
  "slate|gray|zinc|neutral|stone|mauve|olive|mist|taupe|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";

const named = `(?:${palette})-\\d{2,3}|white|black`;
const arbitrary = "\\[(?:#|rgb|hsl|oklch|oklab|color:)[^\\]]*\\]";

const rawColor = new RegExp(`(?<![\\w-])(?:[a-z-]+:)*(?:${utilities})-(?:${named}|${arbitrary})(?![\\w-])`, "g");

export const findRawColors = (source: string): string[] => source.match(rawColor) ?? [];
