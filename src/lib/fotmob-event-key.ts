/** FotMob's eventId=0 is a placeholder shared by unrelated incidents. */
export function fotmobEventKey(event: { eventId?: unknown; reactKey?: unknown }, stableId: string): string {
  const valid = (value: unknown) => value != null && String(value).trim() !== "" && String(value) !== "0" && !String(value).startsWith("undefined");
  if (valid(event.eventId)) return String(event.eventId);
  if (valid(event.reactKey)) return String(event.reactKey);
  return stableId;
}