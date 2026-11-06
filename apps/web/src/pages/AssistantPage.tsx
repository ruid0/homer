import { useEffect, useRef, useState, type FormEvent } from "react";
import { ChatBubble } from "../components/ChatBubble";
import { ScrollCard } from "../components/ScrollCard";
import { inputClass, primaryButton, quietButton, secondaryButton } from "../components/ui";
import { copy } from "../copy";
import { undoDone, withoutFailedSend, type ChatAction, type ChatMessage, type LocalUndo } from "../lib/chatThread";
import { trpc } from "../trpc";

type StoredMessage = { id: number; role: "user" | "assistant"; text: string; actions: ChatAction[] };

const fromStored = ({ id, role, text, actions }: StoredMessage): ChatMessage => ({ key: `h${id}`, role, text, actions });

export const AssistantPage = () => {
  const utils = trpc.useUtils();
  // The stored chat is read fresh each time the screen opens and not kept, so `after` is never from an earlier visit.
  // The model sees only what comes after `after`, the last message when this screen opened.
  const history = trpc.assistant.history.useQuery(undefined, { staleTime: Infinity, gcTime: 0, refetchOnWindowFocus: false });
  const status = trpc.assistant.status.useQuery(undefined, { refetchInterval: 30_000 });
  const send = trpc.assistant.send.useMutation();
  const undo = trpc.assistant.undo.useMutation();
  const clear = trpc.assistant.clear.useMutation();

  const [after, setAfter] = useState<number | null>(null);
  const [thread, setThread] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [showEarlier, setShowEarlier] = useState(false);
  const [local, setLocal] = useState<LocalUndo>({});
  const [problem, setProblem] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (after === null && history.data) setAfter(history.data.lastId);
  }, [after, history.data]);

  const earlier = (history.data?.messages ?? []).filter((message) => after !== null && message.id <= after).map(fromStored);
  // Until the status arrives the assistant is assumed to be there, so the page does not flash a warning.
  const modelState = status.data?.status;
  const offline = modelState !== undefined && modelState !== "ready";

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [thread.length, send.isPending, showEarlier]);

  // What a change touched may be on any page, so those lists are fetched again when they are next shown.
  const refreshData = () =>
    Promise.all([
      utils.inventory.invalidate(),
      utils.groceries.invalidate(),
      utils.schedule.invalidate(),
      utils.tasks.invalidate(),
      utils.events.invalidate(),
    ]);

  const submit = (text: string) => {
    const clean = text.trim();
    if (clean === "" || after === null || send.isPending || offline) return;
    setProblem(null);
    setDraft("");
    setThread((current) => [...current, { key: `u${current.length}-${Date.now()}`, role: "user", text: clean, actions: [] }]);
    send.mutate(
      { text: clean, after },
      {
        onSuccess: (result) => {
          if (result.status === "unreachable") {
            setThread(withoutFailedSend);
            setDraft(clean);
            return utils.assistant.status.invalidate();
          }
          setThread((current) => [...current, fromStored(result.message)]);
          return refreshData();
        },
        onError: () => {
          setThread(withoutFailedSend);
          setDraft(clean);
          setProblem(copy.assistant.sendFailed);
        },
      },
    );
  };

  const undoAll = async (ids: number[]) => {
    setProblem(null);
    try {
      for (const actionId of ids) {
        const result = await undo.mutateAsync({ actionId });
        setLocal((current) => ({ ...current, [actionId]: result.ok ? undoDone : result.message }));
        if (!result.ok) break;
      }
      await refreshData();
    } catch {
      setProblem(copy.assistant.undoFailed);
    }
  };

  const clearChat = () => {
    if (!window.confirm(copy.assistant.confirmClear)) return;
    clear.mutate(undefined, {
      onSuccess: () => {
        setThread([]);
        setShowEarlier(false);
        return utils.assistant.history.invalidate();
      },
      onError: () => setProblem(copy.assistant.clearFailed),
    });
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    submit(draft);
  };

  const hasChat = earlier.length > 0 || thread.length > 0;
  const bubble = (message: ChatMessage) => (
    <ChatBubble key={message.key} message={message} local={local} busy={undo.isPending} onUndo={undoAll} />
  );

  return (
    <div className="flex h-[calc(100dvh-12rem)] min-h-96 flex-col gap-4 md:h-[calc(100dvh-3rem)]">
      <div className="flex min-h-11 items-center justify-between gap-3">
        <h1 className="text-page font-semibold">{copy.assistant.title}</h1>
        {hasChat && (
          <button type="button" className={quietButton} disabled={clear.isPending} onClick={clearChat}>
            {copy.assistant.clear}
          </button>
        )}
      </div>

      {offline && (
        <p role="alert" className="rounded-xl border border-line-strong p-3">
          {modelState === "no_model" ? copy.assistant.noModel : copy.assistant.unreachable}
        </p>
      )}

      <ScrollCard title={copy.assistant.chat} hideTitle className="flex-1">
        {history.isPending && <p role="status">{copy.home.loading}</p>}
        {history.error && <p role="alert">{copy.assistant.loadFailed}</p>}
        {earlier.length > 0 && (
          <button type="button" className={`${quietButton} mb-2`} aria-expanded={showEarlier} onClick={() => setShowEarlier((open) => !open)}>
            {showEarlier ? copy.assistant.hideEarlier : copy.assistant.earlier(earlier.length)}
          </button>
        )}
        {showEarlier && <ul className="mb-4 flex flex-col gap-3 border-b border-line pb-4">{earlier.map(bubble)}</ul>}
        {history.data && thread.length === 0 && !showEarlier && (
          <div className="flex flex-col items-start gap-3 py-2">
            <p className="text-muted">{copy.assistant.examplesHint}</p>
            <div className="flex flex-wrap gap-2">
              {copy.assistant.examples.map((example) => (
                <button key={example} type="button" className={secondaryButton} disabled={offline || after === null || send.isPending} onClick={() => submit(example)}>
                  {example}
                </button>
              ))}
            </div>
          </div>
        )}
        <ul className="flex flex-col gap-3">{thread.map(bubble)}</ul>
        {send.isPending && (
          <p role="status" className="mt-3 text-muted">
            {copy.assistant.thinking}
          </p>
        )}
        {problem && (
          <p role="alert" className="mt-3 text-late">
            {problem}
          </p>
        )}
        <div ref={end} />
      </ScrollCard>

      <form onSubmit={onSubmit} className="flex gap-2">
        <input
          className={inputClass}
          aria-label={copy.assistant.messageLabel}
          placeholder={copy.assistant.placeholder}
          value={draft}
          disabled={offline}
          maxLength={2000}
          onChange={(event) => setDraft(event.target.value)}
        />
        <button type="submit" className={primaryButton} disabled={offline || after === null || send.isPending || draft.trim() === ""}>
          {copy.assistant.send}
        </button>
      </form>
    </div>
  );
};
