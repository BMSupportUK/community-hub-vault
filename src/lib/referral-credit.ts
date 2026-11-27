/**
 * Referral credit rewards. Mirrors the database function
 * public.referral_credit_for_package, which is what actually pays out.
 * Only the referred new customer's very first order earns credit.
 */
export const REFERRAL_REWARDS = [
  { label: "Single User, 12 months", pence: 500 },
  { label: "Multi Room, 12 months", pence: 900 },
  { label: "Triple Room, 12 months", pence: 1300 },
  { label: "Single User, 6 or 1 month", pence: 0 },
] as const;

export function referralCreditForPackage(name: string): number {
  const n = name.toLowerCase();
  if (!/\b12\s*months?\b/.test(n)) return 0;
  if (n.includes("triple")) return 1300;
  if (n.includes("multi")) return 900;
  return 500;
}

export function formatPounds(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}
