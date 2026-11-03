import { createCallerFactory, router } from "../trpc";
import { groceriesRouter } from "./groceries";
import { inventoryRouter } from "./inventory";
import { peopleRouter } from "./people";

export const appRouter = router({
  inventory: inventoryRouter,
  groceries: groceriesRouter,
  people: peopleRouter,
});

export type AppRouter = typeof appRouter;

export const createCaller = createCallerFactory(appRouter);
