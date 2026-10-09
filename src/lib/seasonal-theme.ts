export type Season = "halloween" | "christmas";

/** Season by UK (Europe/London) month: October = Halloween, December = Christmas. */
export function getSeason(date: Date = new Date()): Season | null {
  const month = Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", month: "numeric" }).format(date),
  );
  if (month === 10) return "halloween";
  if (month === 12) return "christmas";
  return null;
}
