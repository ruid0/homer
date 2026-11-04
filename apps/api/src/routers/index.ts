import { createCallerFactory, router } from "../trpc";
import { assistantRouter } from "./assistant";
import { eventsRouter } from "./events";
import { groceriesRouter } from "./groceries";
import { inventoryRouter } from "./inventory";
import { peopleRouter } from "./people";
import { scheduleRouter } from "./schedule";
import { tasksRouter } from "./tasks";

export const appRouter = router({
  inventory: inventoryRouter,
  groceries: groceriesRouter,
  people: peopleRouter,
  tasks: tasksRouter,
  events: eventsRouter,
  schedule: scheduleRouter,
  assistant: assistantRouter,
});

export type AppRouter = typeof appRouter;

export const createCaller = createCallerFactory(appRouter);
