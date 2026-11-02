import { describe, expect, it, vi } from "vitest";
import { createDb } from "../db/client";
import * as sync from "../groceries/sync";
import { createCaller } from "./index";

vi.mock("../groceries/sync", async (importOriginal) => {
  const original = await importOriginal<typeof import("../groceries/sync")>();
  return { ...original, syncGrocery: vi.fn(original.syncGrocery) };
});

describe("groceries.markBought", () => {
  it("rolls back the restock and the entry when a later step fails", async () => {
    const api = createCaller({ db: createDb(":memory:") });
    const { id } = await api.inventory.create({ name: "Milk", unit: "litre", quantity: 1, daysPerUnit: 2, lowThresholdDays: 7 });
    const [entry] = await api.groceries.list();
    vi.mocked(sync.syncGrocery).mockImplementationOnce(() => {
      throw new Error("boom");
    });
    await expect(api.groceries.markBought({ id: entry!.id, quantity: 4 })).rejects.toThrow("boom");
    expect(await api.groceries.list()).toHaveLength(1);
    expect(await api.inventory.list()).toMatchObject([{ id, quantity: 1 }]);
    expect(await api.inventory.history({ id })).toHaveLength(0);
  });
});
