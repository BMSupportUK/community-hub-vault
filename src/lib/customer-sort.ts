import { customerJoinedYear, customerYearsFromYear } from "@/lib/customer-joined-year";

export type CustomerSortField = "default" | "name" | "expires" | "renewed" | "joined" | "years" | "referrer";
export type CustomerSortDir = "asc" | "desc";

export type SortableCustomer = {
  username: string | null;
  displayName: string | null;
  referrerName: string | null;
  renewedAt: string | null;
  firstSubscriptionAt: string | null;
  accounts: { expiresAt: string | null; renewedAt?: string | null }[];
  noRenewal: boolean;
};

const earliest = (values: (string | null | undefined)[]) => {
  const dates = values.filter((v): v is string => !!v).map((v) => new Date(v).getTime()).filter((t) => !Number.isNaN(t));
  return dates.length ? Math.min(...dates) : null;
};

const sortValue = (c: SortableCustomer, field: Exclude<CustomerSortField, "default">): string | number | null => {
  switch (field) {
    case "name": return (c.username || c.displayName || "").trim().toLowerCase() || null;
    case "expires": return earliest(c.accounts.map((a) => a.expiresAt));
    case "renewed": return c.noRenewal ? null : earliest([c.renewedAt, ...c.accounts.map((a) => a.renewedAt)]);
    case "joined": return c.firstSubscriptionAt ? new Date(c.firstSubscriptionAt).getTime() : null;
    case "years": return customerYearsFromYear(customerJoinedYear(c.firstSubscriptionAt));
    case "referrer": return c.referrerName?.trim().toLowerCase() || null;
  }
};

/** Sort customers by the chosen field; missing values always go last regardless of direction. */
export function sortCustomers<T extends SortableCustomer>(rows: T[], field: CustomerSortField, dir: CustomerSortDir): T[] {
  if (field === "default") return rows;
  const sign = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = sortValue(a, field);
    const bv = sortValue(b, field);
    if (av === null && bv === null) return 0;
    if (av === null) return 1;
    if (bv === null) return -1;
    if (av === bv) return 0;
    return av < bv ? -sign : sign;
  });
}
