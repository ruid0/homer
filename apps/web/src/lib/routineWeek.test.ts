import { weekDates } from "@homer/shared";
import { describe, expect, it } from "vitest";
import {
  canGoEarlier,
  canGoLater,
  cycleCount,
  dayLabel,
  dayState,
  isFuture,
  mondayOf,
  oldestWeek,
  tickCount,
  weekdayInitial,
  weekRange,
} from "./routineWeek";

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

describe("cycleCount", () => {
  it("adds one up to the target, then goes back to none", () => {
    expect(cycleCount(0, 3)).toBe(1);
    expect(cycleCount(2, 3)).toBe(3);
    expect(cycleCount(3, 3)).toBe(0);
  });

  it("toggles a target of one", () => {
    expect(cycleCount(0, 1)).toBe(1);
    expect(cycleCount(1, 1)).toBe(0);
  });

  it("clears a count above the target", () => expect(cycleCount(4, 3)).toBe(0));
});

describe("tickCount", () => {
  it("ticks up to the circle that was tapped", () => {
    expect(tickCount(0, 0)).toBe(1);
    expect(tickCount(0, 2)).toBe(3);
    expect(tickCount(1, 1)).toBe(2);
  });

  it("takes a ticked circle and the ones after it away", () => {
    expect(tickCount(3, 0)).toBe(0);
    expect(tickCount(3, 1)).toBe(1);
    expect(tickCount(3, 2)).toBe(2);
  });
});

describe("dayState", () => {
  it("is done at the target or above, partial between, none at zero", () => {
    expect(dayState(2, 2)).toBe("done");
    expect(dayState(5, 2)).toBe("done");
    expect(dayState(1, 2)).toBe("partial");
    expect(dayState(0, 2)).toBe("none");
  });
});

describe("weekdayInitial", () => {
  it("is the first letter of the short name", () => expect(weekdayInitial("2026-11-02")).toBe("M"));
});
