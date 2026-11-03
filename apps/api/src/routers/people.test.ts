import { describe, expect, it } from "vitest";
import { createDb } from "../db/client";
import { messages } from "../messages";
import { createCaller } from "./index";

const setup = () => createCaller({ db: createDb(":memory:") });

describe("people.add and people.list", () => {
  it("is empty at first", async () => {
    expect(await setup().people.list()).toEqual([]);
  });

  it("adds a person with a trimmed name, listed by name", async () => {
    const api = setup();
    await api.people.add({ name: "  Sam " });
    await api.people.add({ name: "Alex" });
    expect(await api.people.list()).toMatchObject([{ name: "Alex" }, { name: "Sam" }]);
  });

  it("rejects a blank name", async () => {
    const api = setup();
    await expect(api.people.add({ name: "   " })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(await api.people.list()).toEqual([]);
  });

  it("rejects a name an active person already has, ignoring case", async () => {
    const api = setup();
    await api.people.add({ name: "Sam" });
    await expect(api.people.add({ name: "sam" })).rejects.toMatchObject({
      code: "CONFLICT",
      message: messages.personNameTaken("sam"),
    });
    expect(await api.people.list()).toHaveLength(1);
  });
});

describe("people.rename", () => {
  it("changes the name", async () => {
    const api = setup();
    const { id } = await api.people.add({ name: "Sam" });
    await api.people.rename({ id, name: "Samantha" });
    expect(await api.people.list()).toMatchObject([{ id, name: "Samantha" }]);
  });

  it("lets a person change only the case of their own name", async () => {
    const api = setup();
    const { id } = await api.people.add({ name: "sam" });
    await api.people.rename({ id, name: "Sam" });
    expect(await api.people.list()).toMatchObject([{ name: "Sam" }]);
  });

  it("rejects another active person's name", async () => {
    const api = setup();
    await api.people.add({ name: "Alex" });
    const { id } = await api.people.add({ name: "Sam" });
    await expect(api.people.rename({ id, name: "alex" })).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("trims the new name", async () => {
    const api = setup();
    const { id } = await api.people.add({ name: "Sam" });
    await api.people.rename({ id, name: "  Alex  " });
    expect(await api.people.list()).toMatchObject([{ name: "Alex" }]);
  });

  it("allows the name of a removed person, and says which name is taken otherwise", async () => {
    const api = setup();
    const old = await api.people.add({ name: "Alex" });
    await api.people.archive({ id: old.id });
    await api.people.add({ name: "Kim" });
    const { id } = await api.people.add({ name: "Sam" });
    await api.people.rename({ id, name: "alex" });
    await expect(api.people.rename({ id, name: "kim" })).rejects.toMatchObject({
      message: messages.personNameTaken("kim"),
    });
  });

  it("fails for an unknown or removed person", async () => {
    const api = setup();
    await expect(api.people.rename({ id: 99, name: "Sam" })).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: messages.personNotFound,
    });
    const { id } = await api.people.add({ name: "Sam" });
    await api.people.archive({ id });
    await expect(api.people.rename({ id, name: "Sam" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("people.archive", () => {
  it("hides the person but keeps the row", async () => {
    const db = createDb(":memory:");
    const api = createCaller({ db });
    const { id } = await api.people.add({ name: "Sam" });
    await api.people.archive({ id });
    expect(await api.people.list()).toEqual([]);
    expect(db.$client.prepare("select archived_at from people where id = ?").get(id)).toMatchObject({
      archived_at: expect.any(String),
    });
  });

  it("frees the name for a new person", async () => {
    const api = setup();
    const { id } = await api.people.add({ name: "Sam" });
    await api.people.archive({ id });
    await api.people.add({ name: "Sam" });
    expect(await api.people.list()).toHaveLength(1);
  });

  it("fails for an unknown or already removed person", async () => {
    const api = setup();
    await expect(api.people.archive({ id: 99 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    const { id } = await api.people.add({ name: "Sam" });
    await api.people.archive({ id });
    await expect(api.people.archive({ id })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
