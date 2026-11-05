export type ChatAction = { id: number; tool: string; undone: boolean };

export type ChatMessage = { key: string; role: "user" | "assistant"; text: string; actions: ChatAction[] };

// What this screen learned about an action: "done" once undone, or the line the api gave when it refused.
export type LocalUndo = Record<number, string>;

export type ActionState =
  | { kind: "none" }
  | { kind: "undo"; ids: number[] }
  | { kind: "undone" }
  | { kind: "refused"; message: string };

const DONE = "done";

export const undoDone = DONE;

// What to show next to a reply that changed something. Undo goes latest first, so each step reverses the one before it.
export const actionState = (actions: readonly ChatAction[], local: LocalUndo): ActionState => {
  if (actions.length === 0) return { kind: "none" };
  const refusal = actions.map((action) => local[action.id]).find((result) => result !== undefined && result !== DONE);
  if (refusal !== undefined) return { kind: "refused", message: refusal };
  const open = actions.filter((action) => !action.undone && local[action.id] !== DONE);
  if (open.length === 0) return { kind: "undone" };
  return { kind: "undo", ids: open.map((action) => action.id).sort((a, b) => b - a) };
};

// A send that never reached the assistant is taken back, so the text can go in the box again.
export const withoutFailedSend = (thread: readonly ChatMessage[]): ChatMessage[] =>
  thread.at(-1)?.role === "user" ? thread.slice(0, -1) : [...thread];
