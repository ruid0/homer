import { describe, expect, it } from "vitest";
import { createApp } from "./app";
import { createDb } from "./db/client";

const post = (path: string, body: unknown) =>
  new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("api over http", () => {
  it("answers the health check", async () => {
    const response = await createApp(createDb(":memory:")).request("/health");
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("ok");
  });

  it("creates an item and lists it with days remaining", async () => {
    const app = createApp(createDb(":memory:"));
    const created = await app.request(
      post("/trpc/inventory.create", { name: "Milk", unit: "litre", quantity: 1, daysPerUnit: 2 }),
    );
    expect(created.status).toBe(200);

    const listed = await app.request("/trpc/inventory.list");
    const body = (await listed.json()) as { result: { data: { name: string; daysRemaining: number }[] } };
    expect(body.result.data).toMatchObject([{ name: "Milk", daysRemaining: 2 }]);
  });

  it("answers invalid input with a 400", async () => {
    const app = createApp(createDb(":memory:"));
    const res = await app.request(post("/trpc/inventory.create", { name: "", unit: "bag", quantity: 1, daysPerUnit: null }));
    expect(res.status).toBe(400);
  });

  it("says what to fix in plain words, not a dump of the validation issues", async () => {
    const app = createApp(createDb(":memory:"));
    const res = await app.request(
      post("/trpc/maintenance.add", { name: "x".repeat(81), every: 3, unit: "months", lastDoneOn: null, today: "2026-11-05" }),
    );
    const body = (await res.json()) as { error: { message: string } };
    expect(res.status).toBe(400);
    expect(body.error.message).toBe("Keep the name to 80 characters or fewer.");
  });

  it("keeps the default message, which names the field, when the schema wrote none", async () => {
    const app = createApp(createDb(":memory:"));
    const res = await app.request(post("/trpc/inventory.create", { name: "", unit: "bag", quantity: 1, daysPerUnit: null }));
    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message).toContain("name");
  });
});
