import cron from "node-cron";
import { and, eq, isNull, lte } from "drizzle-orm";
import { nextClockTime } from "@homer/shared";
import type { Db } from "../db/client";
import { people, routineItems, routineReminders, routineTicks } from "../db/schema";
import { notifyLog, notifyText } from "../messages";
import type { Notifier } from "../notify/ntfy";
import { localDate } from "../time";

// A reminder that is later than this when the job sees it (the Mac was asleep) is dropped instead of sent.
export const MAX_LATE_MINUTES = 30;

type Due = {
  id: number;
  dailyTime: string | null;
  fireAt: string;
  itemId: number;
  target: number;
  personId: number;
  topic: string | null;
};

const dueReminders = (db: Db, now: Date): Due[] =>
  db
    .select({
      id: routineReminders.id,
      dailyTime: routineReminders.dailyTime,
      fireAt: routineReminders.fireAt,
      itemId: routineItems.id,
      target: routineItems.targetPerDay,
      personId: people.id,
      topic: people.notifyTopic,
    })
    .from(routineReminders)
    .innerJoin(routineItems, eq(routineItems.id, routineReminders.routineItemId))
    .innerJoin(people, eq(people.id, routineItems.personId))
    .where(and(isNull(routineReminders.removedAt), isNull(routineItems.removedAt), lte(routineReminders.fireAt, now.toISOString())))
    .all();

const doneToday = (db: Db, itemId: number, today: string): number =>
  db.select({ count: routineTicks.count }).from(routineTicks).where(and(eq(routineTicks.routineItemId, itemId), eq(routineTicks.date, today))).get()
    ?.count ?? 0;

// A one-off reminder is finished once it has fired. A daily one moves on to its next time.
const consume = (db: Db, reminder: Due, now: Date): void => {
  const [hour, minute] = (reminder.dailyTime ?? "").split(":").map(Number);
  const next = reminder.dailyTime && hour !== undefined && minute !== undefined ? nextClockTime(hour, minute, now) : null;
  db.update(routineReminders)
    .set(next ? { fireAt: next.toISOString() } : { removedAt: now.toISOString() })
    .where(and(eq(routineReminders.id, reminder.id), isNull(routineReminders.removedAt)))
    .run();
};

const isLate = (reminder: Due, now: Date): boolean => now.getTime() - Date.parse(reminder.fireAt) > MAX_LATE_MINUTES * 60_000;

const byPerson = (reminders: Due[]): Due[][] =>
  Object.values(
    reminders.reduce<Record<number, Due[]>>(
      (groups, reminder) => ({ ...groups, [reminder.personId]: [...(groups[reminder.personId] ?? []), reminder] }),
      {},
    ),
  );

// Late reminders are dropped. For the rest, one generic note goes to the person if any of their rows is not done today.
// A send that fails leaves the fresh reminders in place, so the next minute tries again until they are too late.
const handlePerson = async (db: Db, notify: Notifier, reminders: Due[], now: Date): Promise<boolean> => {
  const [late, fresh] = [reminders.filter((reminder) => isLate(reminder, now)), reminders.filter((reminder) => !isLate(reminder, now))];
  late.forEach((reminder) => consume(db, reminder, now));
  const today = localDate(now);
  const open = new Set(fresh.filter((reminder) => doneToday(db, reminder.itemId, today) < reminder.target).map((reminder) => reminder.itemId));
  const person = reminders[0];
  if (!person || open.size === 0 || !person.topic) {
    fresh.forEach((reminder) => consume(db, reminder, now));
    return false;
  }
  const delivered = await notify({
    topic: person.topic,
    title: notifyText.title,
    message: notifyText.routine(open.size),
    path: `/people/${person.personId}/routine`,
  });
  if (delivered) fresh.forEach((reminder) => consume(db, reminder, now));
  return delivered;
};

// Returns how many people were notified.
export const sendDueReminders = async (db: Db, notify: Notifier, now: Date): Promise<number> => {
  const results = await Promise.all(byPerson(dueReminders(db, now)).map((reminders) => handlePerson(db, notify, reminders, now)));
  return results.filter(Boolean).length;
};

type Options = { notify: Notifier; now?: () => Date; log?: (message: string) => void };

// Looks once a minute. Never throws.
export const startRoutineReminders = (db: Db, { notify, now = () => new Date(), log = console.log }: Options) => {
  // Mutated on purpose: a slow send must not overlap the next minute's run.
  let running = false;
  return cron.schedule("* * * * *", async () => {
    if (running) return;
    running = true;
    try {
      await sendDueReminders(db, notify, now());
    } catch (error) {
      log(notifyLog.reminderError(error instanceof Error ? error.message : String(error)));
    } finally {
      running = false;
    }
  });
};
