import type { Db } from "../db/client";
import { notifyText } from "../messages";
import { createCaller } from "../routers";

export type DayCounts = { tasksLeft: number; itemsLow: number };

// Tasks still open today (including overdue ones) and items that are low or out.
export const dayCounts = async (db: Db, today: string): Promise<DayCounts> => {
  const api = createCaller({ db });
  const [view, stock] = await Promise.all([api.schedule.view({ today, days: 1 }), api.inventory.list()]);
  return {
    tasksLeft: view.overdue.length + (view.days[0]?.tasks.length ?? 0),
    itemsLow: stock.filter((item) => item.runningLow || item.quantity === 0).length,
  };
};

// Null when there is nothing to say, so a quiet day sends nothing.
export const endOfDayMessage = ({ tasksLeft, itemsLow }: DayCounts): string | null =>
  tasksLeft + itemsLow === 0 ? null : notifyText.endOfDay(tasksLeft, itemsLow);
