import { createCallerFactory, router } from "../trpc";
import { groceriesRouter } from "./groceries";
import { inventoryRouter } from "./inventory";

export const appRouter = router({ inventory: inventoryRouter, groceries: groceriesRouter });

export type AppRouter = typeof appRouter;

export const createCaller = createCallerFactory(appRouter);
