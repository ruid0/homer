import { describe, expect, it, vi } from "vitest";
import { createNtfyNotifier, ntfyConfig, ntfyPayload, sendsInTheClear } from "./ntfy";

const config = { server: "https://ntfy.example", householdTopic: "topic-a", token: null, openUrl: null };
const note = { topic: "topic-a", title: "HOMER", message: "2 items added to the grocery list." };

describe("ntfyConfig", () => {
  it("is off without a household topic", () => {
    expect(ntfyConfig({})).toBeNull();
    expect(ntfyConfig({ NTFY_HOUSEHOLD_TOPIC: "  " })).toBeNull();
  });

  it("defaults to ntfy.sh and trims a trailing slash", () => {
    expect(ntfyConfig({ NTFY_HOUSEHOLD_TOPIC: "t" })).toMatchObject({ server: "https://ntfy.sh", householdTopic: "t" });
    expect(ntfyConfig({ NTFY_HOUSEHOLD_TOPIC: "t", NTFY_SERVER: "https://my.example/" })?.server).toBe("https://my.example");
  });
});

describe("ntfyPayload", () => {
  it("adds a tap link only when a public address is set", () => {
    expect(ntfyPayload(config, { ...note, path: "/groceries" })).not.toHaveProperty("click");
    expect(ntfyPayload({ ...config, openUrl: "https://home.example/" }, { ...note, path: "/groceries" })).toMatchObject({
      click: "https://home.example/groceries",
    });
  });

  it("keeps title and message within ntfy's limits", () => {
    const long = ntfyPayload(config, { ...note, title: "t".repeat(300), message: "m".repeat(900) });
    expect([long.title.length, long.message.length]).toEqual([120, 500]);
  });
});

describe("createNtfyNotifier", () => {
  it("posts JSON to the server and reports success", async () => {
    const send = vi.fn().mockResolvedValue({ ok: true });
    expect(await createNtfyNotifier({ ...config, token: "secret" }, send as never)(note)).toBe(true);
    const [url, init] = send.mock.calls[0]!;
    expect(url).toBe("https://ntfy.example");
    expect(init.headers.authorization).toBe("Bearer secret");
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(init.body)).toMatchObject({ topic: "topic-a", message: note.message });
  });

  it("reports false for a refused or failed send and never throws", async () => {
    expect(await createNtfyNotifier(config, vi.fn().mockResolvedValue({ ok: false }) as never)(note)).toBe(false);
    expect(await createNtfyNotifier(config, vi.fn().mockRejectedValue(new Error("offline")) as never)(note)).toBe(false);
  });
});

describe("sendsInTheClear", () => {
  it("flags a token over plain http to a remote server only", () => {
    expect(sendsInTheClear({ ...config, server: "http://ntfy.example", token: "x" })).toBe(true);
    expect(sendsInTheClear({ ...config, server: "http://ntfy.example", token: null })).toBe(false);
    expect(sendsInTheClear({ ...config, server: "https://ntfy.example", token: "x" })).toBe(false);
    expect(sendsInTheClear({ ...config, server: "http://127.0.0.1:8080", token: "x" })).toBe(false);
  });
});
