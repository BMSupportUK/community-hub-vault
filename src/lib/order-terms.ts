/**
 * Parsing helpers that turn purchased product names into a subscription term
 * (months) and an account type (single / multi / triple room).
 *
 * Product names look like:
 *   "BM Support Digital Service 1 Month | Single User"
 *   "BM Support Digital Service 12 Months | Multi Room"
 *   "BM Support Digital Service 12 Months | Triple Room"
 *   "BM Support 12 Month Package"            (term only, no room wording)
 */

export type AccountType = "single" | "multi" | "triple";

export interface OrderLine {
  product_name: string | null;
  quantity: number | null;
}

export interface OrderTerms {
  /** Total months to add across all lines (term x quantity). */
  months: number;
  /** Account type implied by the purchase, or null when nothing said. */
  accountType: AccountType | null;
  /** Lines we could not read a term from — surfaced to staff. */
  unparsed: string[];
}

const WORD_MONTHS: Record<string, number> = {
  one: 1, two: 2, three: 3, six: 6, twelve: 12,
};

/** Months implied by a single product name, or null when unreadable. */
export function parseMonths(name: string): number | null {
  const n = name.toLowerCase();
  const yearMatch = n.match(/(\d+)\s*(?:year|yr)s?\b/);
  if (yearMatch) return Number(yearMatch[1]) * 12;
  if (/\b(?:a|one)\s*year\b/.test(n)) return 12;
  const monthMatch = n.match(/(\d+)\s*(?:month|mth|mo)s?\b/);
  if (monthMatch) return Number(monthMatch[1]);
  const wordMatch = n.match(/\b(one|two|three|six|twelve)\s*(?:month|mth)s?\b/);
  if (wordMatch) return WORD_MONTHS[wordMatch[1]] ?? null;
  return null;
}

/** Account type implied by a single product name, or null when unstated. */
export function parseAccountType(name: string): AccountType | null {
  const n = name.toLowerCase();
  if (/\btriple\b/.test(n)) return "triple";
  if (/\bmulti[\s-]?room\b|\bmulti[\s-]?user\b|\bmulti\b/.test(n)) return "multi";
  if (/\bsingle\b/.test(n)) return "single";
  return null;
}

export function accountTypeLabelFor(t: AccountType | null | undefined): string {
  if (t === "triple") return "Triple-room account";
  if (t === "multi") return "Multi-room account";
  if (t === "single") return "Single account";
  return "Account";
}

/** Reads an order's lines into a total term plus account type. */
export function deriveOrderTerms(lines: OrderLine[]): OrderTerms {
  let months = 0;
  let accountType: AccountType | null = null;
  const unparsed: string[] = [];
  // Highest room tier on the order wins.
  const rank: Record<AccountType, number> = { single: 1, multi: 2, triple: 3 };

  for (const line of lines) {
    const name = (line.product_name ?? "").trim();
    if (!name) continue;
    const qty = Math.max(1, Number(line.quantity ?? 1) || 1);
    const m = parseMonths(name);
    if (m == null) {
      unparsed.push(name);
    } else {
      months += m * qty;
    }
    const t = parseAccountType(name);
    if (t && (!accountType || rank[t] > rank[accountType])) accountType = t;
  }

  return { months, accountType, unparsed };
}

/** New expiry after adding `months`, stacking onto unexpired time. */
export function extendExpiry(current: string | null | undefined, months: number, now = new Date()): Date {
  const base = current ? new Date(current) : null;
  const from = base && !Number.isNaN(base.getTime()) && base.getTime() > now.getTime() ? base : now;
  const next = new Date(from.getTime());
  const targetMonth = next.getMonth() + months;
  const day = next.getDate();
  next.setDate(1);
  next.setMonth(targetMonth);
  // Clamp to the last day of the target month (e.g. 31 Jan + 1 month).
  const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(day, lastDay));
  return next;
}
