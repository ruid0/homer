import { ntfyWire } from "../messages";

// ntfy accepts at most this much in a title and a message.
const MAX_TITLE = 120;
const MAX_MESSAGE = 500;
const SEND_TIMEOUT_MS = 10_000;

export type Notification = { topic: string; title: string; message: string; path?: string };

// Returns whether the notification was sent. Never throws.
export type Notifier = (note: Notification) => Promise<boolean>;

export type NtfyConfig = { server: string; householdTopic: string; token: string | null; openUrl: string | null };

const clean = (value: string | undefined): string | null => value?.trim() || null;

// Off (null) unless a household topic is set, so nothing leaves the house by default.
export const ntfyConfig = (env: Record<string, string | undefined>): NtfyConfig | null => {
  const householdTopic = clean(env.NTFY_HOUSEHOLD_TOPIC);
  if (!householdTopic) return null;
  return {
    server: (clean(env.NTFY_SERVER) ?? ntfyWire.defaultServer).replace(/\/+$/, ""),
    householdTopic,
    token: clean(env.NTFY_TOKEN),
    openUrl: clean(env.HOMER_PUBLIC_URL),
  };
};

export const ntfyPayload = (config: NtfyConfig, { topic, title, message, path }: Notification) => ({
  topic,
  title: title.slice(0, MAX_TITLE),
  message: message.slice(0, MAX_MESSAGE),
  ...(config.openUrl ? { click: `${config.openUrl.replace(/\/+$/, "")}${path ?? "/"}` } : {}),
});

export const createNtfyNotifier =
  (config: NtfyConfig, send: typeof fetch = fetch): Notifier =>
  async (note) => {
    try {
      const response = await send(config.server, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(config.token ? { authorization: ntfyWire.bearer(config.token) } : {}),
        },
        body: JSON.stringify(ntfyPayload(config, note)),
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      });
      return response.ok;
    } catch {
      return false;
    }
  };

// A token or text sent to a plain http server crosses the network unencrypted. Loopback is fine.
export const sendsInTheClear = ({ server, token }: NtfyConfig): boolean =>
  token !== null && /^http:\/\//.test(server) && !/^http:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(server);
