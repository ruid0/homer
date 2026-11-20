// A blank date with a time or a repeat means today, so the person is not told off for leaving it empty; with neither it stays "anytime".
export const dueDateFor = (date: string, time: string, repeat: string, today: string): string | null =>
  date !== "" ? date : time !== "" || repeat !== "" ? today : null;
