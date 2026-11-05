import { describe, expect, it } from "vitest";
import { actionState, withoutFailedSend, type ChatMessage } from "./chatThread";

const action = (id: number, undone = false) => ({ id, tool: "mark_out", undone });

describe("actionState", () => {
  it("has nothing to undo for a message without actions", () => {
    expect(actionState([], {})).toEqual({ kind: "none" });
  });

  it("offers Undo for every action not yet undone, latest first", () => {
    expect(actionState([action(3), action(5), action(4, true)], {})).toEqual({ kind: "undo", ids: [5, 3] });
  });

  it("is undone when the server says every action is", () => {
    expect(actionState([action(1, true), action(2, true)], {})).toEqual({ kind: "undone" });
  });

  it("is undone when this screen undid the rest", () => {
    expect(actionState([action(1, true), action(2)], { 2: "done" })).toEqual({ kind: "undone" });
  });

  it("shows the refusal and stops offering Undo", () => {
    expect(actionState([action(1), action(2)], { 2: "Salt changed since, so this can't be undone." })).toEqual({
      kind: "refused",
      message: "Salt changed since, so this can't be undone.",
    });
  });

  it("offers Undo for the actions left after the latest ones were undone", () => {
    expect(actionState([action(1), action(2)], { 2: "done" })).toEqual({ kind: "undo", ids: [1] });
  });
});

describe("withoutFailedSend", () => {
  const message = (key: string, role: ChatMessage["role"]): ChatMessage => ({ key, role, text: key, actions: [] });

  it("drops the last message when it is the person's, so it can be sent again", () => {
    expect(withoutFailedSend([message("a", "user"), message("b", "assistant"), message("c", "user")]).map((m) => m.key)).toEqual(["a", "b"]);
  });

  it("leaves a thread that ends with a reply alone", () => {
    expect(withoutFailedSend([message("a", "user"), message("b", "assistant")])).toHaveLength(2);
  });
});
