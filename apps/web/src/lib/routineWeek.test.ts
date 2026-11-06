import { weekDates } from "@homer/shared";
import { describe, expect, it } from "vitest";
import { canGoEarlier, canGoLater, dayLabel, isFuture, mondayOf, oldestWeek, takeOneOff, tapCount, weekRange } from "./routineWeek";

const today = "2026-11-05"; // Thursday

describe("week navigation", () => {
  it("finds this week's Monday", () => expect(mondayOf(today)).toBe("2026-11-02"));

  it("cannot go later than this week", () => {
    expect(canGoLater("2026-11-02", today)).toBe(false);
    expect(canGoLater("2026-10-26", today)).toBe(true);
  });

  it("can go back until the oldest week the api accepts", () => {
    expect(oldestWeek(today)).toBe("2026-09-07");
    expect(canGoEarlier("2026-09-14", today)).toBe(true);
    expect(canGoEarlier("2026-09-07", today)).toBe(false);
  });
});

describe("day text", () => {
  it("labels a Monday and a Sunday", () => {
    expect(dayLabel("2026-11-02")).toBe("Mon 2");
    expect(dayLabel("2026-11-08")).toBe("Sun 8");
  });

  it("names the range of a week", () => expect(weekRange(weekDates(today))).toBe("2 Nov to 8 Nov"));

  it("tells future days from today and the past", () => {
    expect(isFuture("2026-11-06", today)).toBe(true);
    expect(isFuture(today, today)).toBe(false);
  });
});

describe("tapCount", () => {
  it("fills a cell up to its target", () => {
    expect(tapCount(0, 2)).toBe(1);
    expect(tapCount(1, 2)).toBe(2);
  });

  it("stops at the target when it is more than one", () => expect(tapCount(2, 2)).toBe(2));

  it("clears a done cell when the target is one", () => {
    expect(tapCount(0, 1)).toBe(1);
    expect(tapCount(1, 1)).toBe(0);
  });

  it("leaves a count above the target alone", () => expect(tapCount(4, 3)).toBe(4));
});

describe("takeOneOff", () => {
  it("lowers by one and stops at zero", () => {
    expect(takeOneOff(2)).toBe(1);
    expect(takeOneOff(0)).toBe(0);
  });
});
