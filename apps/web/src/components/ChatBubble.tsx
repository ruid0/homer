import { actionState, type ChatMessage, type LocalUndo } from "../lib/chatThread";
import { secondaryButton } from "./ui";
import { copy } from "../copy";

type Props = { message: ChatMessage; local: LocalUndo; busy: boolean; onUndo: (ids: number[]) => void };

// The person's lines sit right, the assistant's left. A reply that changed something carries its Undo.
export const ChatBubble = ({ message, local, busy, onUndo }: Props) => {
  const mine = message.role === "user";
  const state = actionState(message.actions, local);
  return (
    <li className={`flex flex-col gap-1 ${mine ? "items-end" : "items-start"}`}>
      <span className="text-meta text-muted">{mine ? copy.assistant.you : copy.assistant.assistant}</span>
      <p
        className={`max-w-[85%] whitespace-pre-line rounded-2xl px-4 py-2 text-title ${
          mine ? "bg-primary text-on-primary" : "border border-line bg-hover"
        }`}
      >
        {message.text}
      </p>
      {state.kind === "undo" && (
        <button type="button" className={secondaryButton} disabled={busy} onClick={() => onUndo(state.ids)}>
          {copy.assistant.undo}
        </button>
      )}
      {state.kind === "undone" && <p className="text-meta text-muted">{copy.assistant.undone}</p>}
      {state.kind === "refused" && (
        <p role="alert" className="max-w-[85%] text-meta text-late">
          {state.message}
        </p>
      )}
    </li>
  );
};
