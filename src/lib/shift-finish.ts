export function ukClock(at: number) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(at);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}:${get("second")}` };
}

/** All manual shift exits must use the same UK rota-end gate. */
export function shiftFinishAction(now: number, rotaEnd: string | null, pending: boolean, ready = true) {
  if (!ready) return "wait";
  if (rotaEnd && ukClock(now).time < rotaEnd) return pending ? "wait" : "request";
  return "clock-out";
}