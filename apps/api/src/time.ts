import { settingLog } from "./messages";

const pad = (n: number) => String(n).padStart(2, "0");

// The household's own day, which follows the TZ setting of the process.
export const localDate = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const parseClockTime = (time: string, setting: string): { hour: number; minute: number } => {
  const match = TIME.exec(time);
  if (!match) throw new Error(settingLog.badTime(setting, time));
  return { hour: Number(match[1]), minute: Number(match[2]) };
};
