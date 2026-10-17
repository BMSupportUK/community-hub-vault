import { customerJoinedYear } from "./customer-joined-year";

export function customerHasRecordedYear(firstSubscriptionAt: string | null): boolean {
  return customerJoinedYear(firstSubscriptionAt) !== null;
}

/** Customers with no recorded year, or under 1 year (still on their first order), have not renewed yet. */
export function customerShowsNoRenewal(hasRecordedYear: boolean, years: number | null): boolean {
  return !hasRecordedYear || years === null || years < 1;
}

export function customerDate(value: string | null): string {
  if (!value) return "Not recorded";
  return new Date(value).toLocaleDateString("en-GB", {
    timeZone: "Europe/London", day: "numeric", month: "short", year: "numeric",
  });
}