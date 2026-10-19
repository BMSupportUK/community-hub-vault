/** Rota days close at UK midnight, not the viewer's midnight. */
export function rotaDayClosed(shiftDate: string, now = Date.now()): boolean {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date(now)).map((part) => [part.type, part.value]));
  return shiftDate <= `${parts.year}-${parts.month}-${parts.day}`;
}
