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

/**
 * Early finish reasons are required: the request goes to admin and management,
 * who need to see why the staff member wants off before they approve it.
 * Returns null when the text is empty, whitespace-only or unusable.
 */
export function normalizeEarlyFinishReason(value: unknown): string | null {
  const reason = String(value ?? "").replace(/\s+/g, " ").trim().slice(0, 300);
  return reason.length > 0 ? reason : null;
}

/**
 * Ask the staff member for a reason, repeating until one is actually given.
 * Returns null when they cancel, so the caller can back out without sending.
 */
export function askEarlyFinishReason(): string | null {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const answer = window.prompt(
      attempt === 0
        ? "Request an early finish — admin or management must approve it.\n\nReason (required):"
        : "A reason is required so admin or management can see why.\n\nReason (required):",
    );
    if (answer === null) return null;
    const reason = normalizeEarlyFinishReason(answer);
    if (reason) return reason;
  }
  return null;
}