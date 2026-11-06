import { randomUUID } from "node:crypto";
import type { APIRequestContext } from "@playwright/test";

const call = async <T>(request: APIRequestContext, procedure: string, data: unknown): Promise<T> => {
  const response = await request.post(`/trpc/${procedure}`, { data });
  const body = (await response.json()) as { result?: { data: T } };
  if (!body.result) throw new Error(`${procedure} failed: ${JSON.stringify(body)}`);
  return body.result.data;
};

// A person with one routine row ("Row A", twice a day) on the scratch copy. Each test gets its own, so tests do not share state.
export const seedPerson = async (request: APIRequestContext) => {
  const person = await call<{ id: number }>(request, "people.add", { name: `Person ${randomUUID()}` });
  await call(request, "routines.addItem", { personId: person.id, name: "Row A", targetPerDay: 2 });
  return person.id;
};

export const addRow = async (request: APIRequestContext, personId: number, name: string) =>
  call<{ id: number }>(request, "routines.addItem", { personId, name, targetPerDay: 1 });

// Turns reminders on for a person and adds one at a clock time, all through the api.
export const seedReminder = async (request: APIRequestContext, personId: number, itemId: number, text: string) => {
  await call(request, "people.reminderSetup", { id: personId });
  return call(request, "routines.addReminder", { itemId, text, repeatDaily: false });
};

type Unit = "weeks" | "months" | "years";

// The household day on the scratch copies. The api and the browser both run in UTC.
export const todayUtc = (): string => new Date().toISOString().slice(0, 10);

export const daysAgo = (days: number): string => new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

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

export const seedUpkeep = (request: APIRequestContext, item: { name: string; every: number; unit: Unit; lastDoneOn: string | null }) =>
  call<{ id: number }>(request, "maintenance.add", { ...item, today: todayUtc() });
