import type { DigestContent } from "./templates";

export function isDigestEmpty(c: DigestContent): boolean {
  return !c.updates.length && !c.awaiting.length && !c.statusChanges.length && !c.dueSoon.length;
}

function easternParts(now: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23", weekday: "short",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return { y: Number(get("year")), m: Number(get("month")), d: Number(get("day")), h: Number(get("hour")), wd: get("weekday") };
}

export function easternHour(now: Date): number {
  return easternParts(now).h;
}

export function weekStartEastern(now: Date): string {
  const { y, m, d, wd } = easternParts(now);
  const offset = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(wd);
  const date = new Date(Date.UTC(y, m - 1, d - offset));
  return date.toISOString().slice(0, 10);
}
