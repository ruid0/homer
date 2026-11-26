import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { z } from "zod";
import { mcpToolDescriptions, mcpToolSchemas, needsRestock } from "@homer/shared";
import type { Db } from "../db/client";
import { mcpMessages } from "../messages";
import { createCaller } from "../routers/index";
import { reply, said, withNamed, written, type Result } from "./named";

type Name = "update_item" | "remove_item" | "remove_from_groceries";
type Args<N extends Name> = z.infer<(typeof mcpToolSchemas)[N]>;

// Items and the grocery list, changed the way the app changes them. The in-app assistant does not get these.
export const registerStockTools = (server: McpServer, { db }: { db: Db }) => {
  const api = createCaller({ db });
  const text = (result: Result) =>
    String(result.message ?? mcpMessages.written("stock", (result.actionId as number | null) ?? null));

  const write = <N extends Name>(name: N, run: (args: Args<N>, words: string) => Promise<Result>) =>
    server.registerTool(
      name,
      {
        description: `${mcpToolDescriptions[name]} ${mcpMessages.saidRule}`,
        inputSchema: mcpToolSchemas[name].extend({ said }),
        annotations: { readOnlyHint: false, destructiveHint: false },
      },
      async ({ said: words, ...args }: Record<string, unknown> & { said: string }) => {
        const result = await run(args as Args<N>, words);
        return reply(result, text(result));
      },
    );

  write("update_item", async (args, words) => {
    const { newName, unit, quantity, daysPerUnit, lowThresholdDays } = args;
    if ([newName, unit, quantity, daysPerUnit, lowThresholdDays].every((value) => value == null)) {
      return { status: "nothing_to_change", message: mcpMessages.nothingToChange };
    }
    return withNamed(await api.inventory.list(), args.name, words, "items", (item) =>
      written("update_item", args, db, () =>
        api.inventory
          .update({
            id: item.id,
            name: newName ?? item.name,
            unit: unit ?? item.unit,
            quantity: quantity ?? item.quantity,
            // The number typed in, not the learned one: passing the learned one back would restart the learning.
            daysPerUnit: daysPerUnit ?? item.daysPerUnitEntered,
            lowThresholdDays: lowThresholdDays ?? item.lowThresholdDays,
          })
          .then((updated) => ({ status: "updated", item: updated.name })),
      ),
    );
  });

  write("remove_item", async (args, words) =>
    withNamed(await api.inventory.list(), args.name, words, "items", (item) =>
      written("remove_item", args, db, () =>
        api.inventory.archive({ id: item.id }).then(() => ({ status: "removed", item: item.name })),
      ),
    ),
  );

  write("remove_from_groceries", async (args, words) => {
    const stocked = await api.inventory.list();
    const entries = (await api.groceries.list()).map(({ id, text: name, itemId }) => ({ id, name, itemId }));
    // An item that still needs restocking is put back on the list by the next edit or the daily check.
    const comesBack = (itemId: number | null) => stocked.some((item) => item.id === itemId && needsRestock(item));
    return withNamed(entries, args.name, words, "entries", (entry) =>
      written("remove_from_groceries", args, db, () =>
        api.groceries.remove({ id: entry.id }).then(() => ({
          status: "removed",
          entry: entry.name,
          ...(comesBack(entry.itemId) ? { note: mcpMessages.stillLow(entry.name) } : {}),
        })),
      ),
    );
  });
};
