import { randomUUID } from "node:crypto";
import type { APIRequestContext } from "@playwright/test";

const call = async <T>(request: APIRequestContext, procedure: string, data: unknown): Promise<T> => {
  const response = await request.post(`/trpc/${procedure}`, { data });
  const body = (await response.json()) as { result?: { data: T } };
  if (!body.result) throw new Error(`${procedure} failed: ${JSON.stringify(body)}`);
  return body.result.data;
};

// A person with one routine row ("Row A", twice a day) on the scratch copy. Each test gets its own, so tests do not
// share state.
export const seedPerson = async (request: APIRequestContext) => {
  const person = await call<{ id: number }>(request, "people.add", { name: `Person ${randomUUID()}` });
  await call(request, "routines.addItem", { personId: person.id, name: "Row A", targetPerDay: 2 });
  return person.id;
};

export const addRow = async (request: APIRequestContext, personId: number, name: string, targetPerDay = 1) =>
  call<{ id: number }>(request, "routines.addItem", { personId, name, targetPerDay });

// A person with no routine rows.
export const seedEmptyPerson = async (request: APIRequestContext) =>
  (await call<{ id: number }>(request, "people.add", { name: `Person ${randomUUID()}` })).id;

// Today as the routine strip names it, for example "Thu 19".
export const todayLabel = (): string => {
  const now = new Date();
  return `${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][now.getUTCDay()]} ${now.getUTCDate()}`;
};

// Turns reminders on for a person and adds one at a clock time, all through the api.
export const seedReminder = async (
  request: APIRequestContext,
  personId: number,
  itemId: number,
  text: string,
  repeatDaily = false,
) => {
  await call(request, "people.reminderSetup", { id: personId });
  return call<{ id: number }>(request, "routines.addReminder", { itemId, text, repeatDaily });
};

export const removeReminder = (request: APIRequestContext, id: number) =>
  call(request, "routines.removeReminder", { id });

// The clock time, in UTC like the scratch copies, that many minutes from now.
export const clockIn = (minutes: number): string => new Date(Date.now() + minutes * 60_000).toISOString().slice(11, 16);

type Unit = "weeks" | "months" | "years";

// The household day on the scratch copies. The api and the browser both run in UTC.
export const todayUtc = (): string => new Date().toISOString().slice(0, 10);

export const daysAgo = (days: number): string => new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

export const daysAhead = (days: number): string => daysAgo(-days);

const query = async <T>(request: APIRequestContext, procedure: string, input: unknown): Promise<T> => {
  const response = await request.get(`/trpc/${procedure}?input=${encodeURIComponent(JSON.stringify(input))}`);
  const body = (await response.json()) as { result?: { data: T } };
  if (!body.result) throw new Error(`${procedure} failed: ${JSON.stringify(body)}`);
  return body.result.data;
};

export const clearUpkeep = async (request: APIRequestContext) => {
  const items = await query<{ id: number }[]>(request, "maintenance.list", { today: todayUtc() });
  for (const item of items) await call(request, "maintenance.remove", { id: item.id });
};

export const seedUpkeep = (
  request: APIRequestContext,
  item: { name: string; every: number; unit: Unit; lastDoneOn: string | null },
) => call<{ id: number }>(request, "maintenance.add", { ...item, today: todayUtc() });

// One more done date on a job, through the api.
export const seedDone = (request: APIRequestContext, id: number, doneOn: string) =>
  call(request, "maintenance.markDone", { id, doneOn, today: todayUtc() });

// The done dates of a job, newest first, as the api holds them.
export const doneDates = async (request: APIRequestContext, id: number) =>
  (await query<{ doneOn: string }[]>(request, "maintenance.history", { id })).map((row) => row.doneOn);

export const seedTask = (
  request: APIRequestContext,
  task: { title: string; dueDate: string | null; dueTime?: string | null; repeat?: "daily" | "weekly" | "monthly" },
) =>
  call<{ id: number }>(request, "tasks.add", {
    title: task.title,
    dueDate: task.dueDate,
    dueTime: task.dueTime ?? null,
    repeat: task.repeat ?? null,
  });

export const seedEvent = (request: APIRequestContext, event: { title: string; date: string; time?: string | null }) =>
  call<{ id: number }>(request, "events.add", { title: event.title, date: event.date, time: event.time ?? null });

// An item that runs out in two days (one unit, two days per unit), with a unique name.
export const seedItem = (request: APIRequestContext, name: string) =>
  call<{ id: number }>(request, "inventory.create", { name, unit: "bag", quantity: 1, daysPerUnit: 2 });

// A free-text entry on the grocery list, through the api.
export const seedListEntry = (request: APIRequestContext, text: string) =>
  call<{ id: number }>(request, "groceries.add", { text });

// An item with plenty left (ten units that each last thirty days), so it is not low and not on the grocery list.
export const seedStocked = (request: APIRequestContext, name: string) =>
  call<{ id: number }>(request, "inventory.create", { name, unit: "bag", quantity: 10, daysPerUnit: 30 });
