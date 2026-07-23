// All week math is UTC and anchored to Monday 00:00:00. A "week start" is the
// ISO date (YYYY-MM-DD) of that Monday and is the canonical key for weekly data.
const DAY_MS = 86_400_000;

function toUTCDate(d: Date | string): Date {
  return typeof d === "string" ? new Date(d) : d;
}

export function weekStart(d: Date | string): string {
  const date = toUTCDate(d);
  const dow = date.getUTCDay(); // 0=Sun..6=Sat
  const daysSinceMonday = (dow + 6) % 7; // Mon->0, Sun->6
  const monday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - daysSinceMonday * DAY_MS);
  return monday.toISOString().slice(0, 10);
}

export function addWeeks(weekStartISO: string, n: number): string {
  const monday = new Date(`${weekStartISO}T00:00:00Z`);
  return new Date(monday.getTime() + n * 7 * DAY_MS).toISOString().slice(0, 10);
}

export function isCompletedWeek(weekStartISO: string, now: Date): boolean {
  const nextMonday = new Date(`${addWeeks(weekStartISO, 1)}T00:00:00Z`);
  return now.getTime() >= nextMonday.getTime();
}

export function weekStartsBetween(fromISO: string, toISO: string): string[] {
  const start = weekStart(fromISO);
  const end = weekStart(toISO);
  const out: string[] = [];
  let cur = start;
  while (cur <= end) {
    out.push(cur);
    cur = addWeeks(cur, 1);
  }
  return out;
}
