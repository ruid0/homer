import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { resolveName } from "./resolveName";

const candidates = [
  { id: 1, name: "Milk" },
  { id: 2, name: "Oat milk" },
  { id: 3, name: "Dish soap" },
  { id: 4, name: "Salt" },
];

describe("resolveName", () => {
  it("matches a name exactly, ignoring case and extra spaces", () => {
    expect(resolveName("  SALT ", candidates)).toEqual({ kind: "one", match: { id: 4, name: "Salt" } });
    expect(resolveName("dish   soap", candidates)).toEqual({ kind: "one", match: { id: 3, name: "Dish soap" } });
  });

  it("prefers the exact name over a longer name that contains it", () => {
    expect(resolveName("milk", candidates)).toEqual({ kind: "one", match: { id: 1, name: "Milk" } });
  });

  it("matches a plural to the singular", () => {
    expect(resolveName("salts", candidates)).toEqual({ kind: "one", match: { id: 4, name: "Salt" } });
  });

  it("matches a part of one name when only one name contains it", () => {
    expect(resolveName("oat", candidates)).toEqual({ kind: "one", match: { id: 2, name: "Oat milk" } });
    expect(resolveName("soap", candidates)).toEqual({ kind: "one", match: { id: 3, name: "Dish soap" } });
  });

  it("does not treat a short fragment as a word", () => {
    const result = resolveName("m", [{ id: 1, name: "Milk" }, { id: 2, name: "Mustard" }]);
    expect(result.kind).toBe("none");
    const two = resolveName("milk", [{ id: 1, name: "Oat milk" }, { id: 2, name: "Soy milk" }]);
    expect(two).toEqual({ kind: "many", matches: [{ id: 1, name: "Oat milk" }, { id: 2, name: "Soy milk" }] });
  });

  it("does not match a longer request to a shorter tracked name", () => {
    expect(resolveName("almond milk", candidates)).toEqual({ kind: "none" });
  });

  it("returns none for an empty list or a blank query", () => {
    expect(resolveName("salt", [])).toEqual({ kind: "none" });
    expect(resolveName("   ", candidates)).toEqual({ kind: "none" });
  });

  it("always finds a candidate by its own name, whatever the case", () => {
    const name = fc.stringMatching(/^[a-z]{2,7}[a-rt-z]( [a-z]{3,8}[a-rt-z])?$/);
    fc.assert(
      fc.property(fc.uniqueArray(name, { minLength: 1, maxLength: 6 }), fc.boolean(), (names, upper) => {
        const list = names.map((value, index) => ({ id: index, name: value }));
        const target = list[0]!;
        const query = upper ? target.name.toUpperCase() : target.name;
        const result = resolveName(query, list);
        expect(result.kind === "one" && result.match.id).toBe(target.id);
      }),
    );
  });
});
