export function customerDate(value: string | null): string {
  if (!value) return "Not recorded";
  return new Date(value).toLocaleDateString("en-GB", {
    timeZone: "Europe/London", day: "numeric", month: "short", year: "numeric",
  });
}