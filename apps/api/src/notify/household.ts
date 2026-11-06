import { notifyLog, notifyText } from "../messages";
import { createNtfyNotifier, ntfyConfig, sendsInTheClear, type Notifier } from "./ntfy";

export type Household = { topic: string; notify: Notifier; announceListed: (count: number) => void };

// Null (and one log line) when notifications are off, so callers have nothing to switch on.
export const householdNotifications = (
  settings: Record<string, string | undefined>,
  log: (message: string) => void = console.log,
  notifier?: Notifier,
): Household | null => {
  const config = ntfyConfig(settings);
  if (!config) {
    log(notifyLog.off);
    return null;
  }
  if (sendsInTheClear(config)) log(notifyLog.insecureServer);
  const notify = notifier ?? createNtfyNotifier(config);
  const announceListed = (count: number) => {
    const message = notifyText.addedToList(count);
    const note = { topic: config.householdTopic, title: notifyText.title, message, path: "/groceries" };
    void notify(note).then((sent) => sent || log(notifyLog.sendFailed(message)));
  };
  return { topic: config.householdTopic, notify, announceListed };
};
