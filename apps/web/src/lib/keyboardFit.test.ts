import { describe, expect, it } from "vitest";
import { keyboardFit } from "./keyboardFit";

describe("keyboardFit", () => {
  it("fits the sheet to the visible area when a keyboard covers the bottom of a phone", () => {
    expect(keyboardFit({ height: 400, offsetTop: 0 }, 800, 390)).toEqual({ top: 8, maxHeight: 384 });
  });
  it("follows the visible area when the page is shifted", () => {
    expect(keyboardFit({ height: 400, offsetTop: 60 }, 800, 390)).toEqual({ top: 68, maxHeight: 384 });
  });
  it("does nothing without a keyboard", () => {
    expect(keyboardFit({ height: 790, offsetTop: 0 }, 800, 390)).toBeNull();
  });
  it("does nothing on a wide screen", () => {
    expect(keyboardFit({ height: 400, offsetTop: 0 }, 800, 1024)).toBeNull();
  });
});
