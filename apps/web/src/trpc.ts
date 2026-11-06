import { QueryClient } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import type { inferRouterOutputs } from "@trpc/server";
import { createTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "../../api/src/routers";

export const trpc = createTRPCReact<AppRouter>();

type Outputs = inferRouterOutputs<AppRouter>["inventory"];

export type ListItem = Outputs["list"][number];

export type ListEntry = inferRouterOutputs<AppRouter>["groceries"]["list"][number];

export type ListPerson = inferRouterOutputs<AppRouter>["people"]["list"][number];

export type RoutineWeek = inferRouterOutputs<AppRouter>["routines"]["week"];

export type RoutineRow = RoutineWeek["items"][number];

type ScheduleView = inferRouterOutputs<AppRouter>["schedule"]["view"];

export type ScheduleTask = ScheduleView["overdue"][number];

export type ScheduleEvent = ScheduleView["days"][number]["events"][number];

export type ArchivedItem = NonNullable<Outputs["findArchived"]>;

export const queryClient = new QueryClient();

export const trpcClient = trpc.createClient({
  links: [httpBatchLink({ url: "/trpc" })],
});
