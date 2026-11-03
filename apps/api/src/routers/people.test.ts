import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createDb } from "../db/client";
import { people } from "../db/schema";
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

  it("fails for an unknown person, even when the new name is taken", async () => {
    const api = setup();
    await api.people.add({ name: "Alex" });
    await expect(api.people.rename({ id: 99, name: "Sam" })).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: messages.personNotFound,
    });
    await expect(api.people.rename({ id: 99, name: "alex" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("people hidden by an earlier build", () => {
  const setupWithHidden = async () => {
    const db = createDb(":memory:");
    const api = createCaller({ db });
    const { id } = await api.people.add({ name: "Old" });
    db.update(people).set({ archivedAt: new Date().toISOString() }).where(eq(people.id, id)).run();
    return { api, id };
  };

  it("stay out of the list", async () => {
    const { api } = await setupWithHidden();
    expect(await api.people.list()).toEqual([]);
  });

  it("do not block their name, in add or rename", async () => {
    const { api } = await setupWithHidden();
    const { id } = await api.people.add({ name: "Sam" });
    await api.people.add({ name: "old" });
    await api.people.rename({ id, name: "OLD2" });
    const names = (await api.people.list()).map((person) => person.name);
    expect(names.sort()).toEqual(["OLD2", "old"]);
  });

  it("cannot be renamed", async () => {
    const { api, id } = await setupWithHidden();
    await expect(api.people.rename({ id, name: "Back" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
