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

  it("rejects a name someone already has, ignoring case", async () => {
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

  it("trims the new name", async () => {
    const api = setup();
    const { id } = await api.people.add({ name: "Sam" });
    await api.people.rename({ id, name: "  Alex  " });
    expect(await api.people.list()).toMatchObject([{ name: "Alex" }]);
  });

  it("lets a person change only the case of their own name", async () => {
    const api = setup();
    const { id } = await api.people.add({ name: "sam" });
    await api.people.rename({ id, name: "Sam" });
    expect(await api.people.list()).toMatchObject([{ name: "Sam" }]);
  });

  it("rejects another person's name and says which one is taken", async () => {
    const api = setup();
    await api.people.add({ name: "Alex" });
    const { id } = await api.people.add({ name: "Sam" });
    await expect(api.people.rename({ id, name: "alex" })).rejects.toMatchObject({
      code: "CONFLICT",
      message: messages.personNameTaken("alex"),
    });
  });

  it("fails for an unknown person", async () => {
    await expect(setup().people.rename({ id: 99, name: "Sam" })).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: messages.personNotFound,
    });
  });
});
