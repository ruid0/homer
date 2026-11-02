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
});
