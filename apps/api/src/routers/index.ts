import { createCallerFactory, router } from "../trpc";
import { inventoryRouter } from "./inventory";

export const appRouter = router({ inventory: inventoryRouter });

export type AppRouter = typeof appRouter;

export const createCaller = createCallerFactory(appRouter);
