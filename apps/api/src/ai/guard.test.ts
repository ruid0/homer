import { describe, expect, it } from "vitest";
import { refuseWrite } from "./guard";

const out = (name: string) => ({ name: "mark_out", args: { name } }) as const;
const say = (now: string, before = "") => ({ now, recent: `${before} ${now}` });

describe("refuseWrite", () => {
  it("lets a name the person said through", () => {
    expect(refuseWrite(out("Salt"), say("We're out of salt"), ["Salt"])).toBeNull();
  });

  it.each([
    ["Apple", "Out of apples"],
    ["Cookie", "We finished the cookies"],
    ["Battery", "Out of batteries"],
    ["Glass", "Bought glasses"],
    ["Egg", "Out of the eggs"],
  ])("matches %s with %j", (item, text) => {
    expect(refuseWrite(out(item), say(text), [item, "Salt"])).toBeNull();
  });

  it("refuses one pick out of several matches", () => {
    const refusal = refuseWrite(out("Oat milk"), say("We're out of milk"), ["Oat milk", "Soy milk"]);
    expect(refusal?.status).toBe("not_said");
  });

  it("lets a single item with a longer name through", () => {
    expect(refuseWrite(out("Dish soap"), say("out of soap"), ["Dish soap", "Salt"])).toBeNull();
  });

  it("lets a typo or another language through when nothing else matches", () => {
    expect(refuseWrite(out("Milk"), say("out of mlik"), ["Milk", "Salt"])).toBeNull();
    expect(refuseWrite(out("Salt"), say("Закончилась соль"), ["Salt", "Milk"])).toBeNull();
  });

  it("counts what was said earlier on the screen", () => {
    expect(refuseWrite({ name: "restock_item", args: { name: "Milk", quantity: 3 } }, say("3", "bought milk"), ["Milk", "Oat milk"])).toBeNull();
  });

  it("refuses to mark an item out when asked to delete it", () => {
    expect(refuseWrite(out("Milk"), say("Delete the milk from the system"), ["Milk"])?.status).toBe("cannot_delete");
  });

  it("only refuses the item the delete is about", () => {
    expect(refuseWrite(out("Salt"), say("Mark salt out and delete the old milk entry"), ["Salt", "Milk"])).toBeNull();
    expect(refuseWrite(out("Milk"), say("Don't delete anything, we're out of milk"), ["Milk"])).toBeNull();
  });

  it("does not check tools that take no item name", () => {
    expect(refuseWrite({ name: "add_task", args: { title: "Water plants" } } as never, say("remind Ben"), ["Salt"])).toBeNull();
  });
});
