import { describe, expect, it } from "vitest";
import { createDb } from "../db/client";
import { readState, writeState } from "./state";

describe("job state", () => {
  it("reads nothing before a write, and the latest value after two", () => {
    const db = createDb(":memory:");
    expect(readState(db, "key")).toBeNull();
    writeState(db, "key", "first");
    writeState(db, "key", "second");
    expect(readState(db, "key")).toBe("second");
  });
});
