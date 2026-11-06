import type { ZodError } from "zod";

export const issueMessages = (error: ZodError): string => error.issues.map((issue) => issue.message).join(" ");
