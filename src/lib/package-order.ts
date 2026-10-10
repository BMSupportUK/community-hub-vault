// Packages are always listed in BM Support's own sales order rather than by takings:
// single-user 12 months, then 6, then 1 month, followed by Multi Room and Triple Room.

export type PackageSortKey = { roomTier: number; months: number };

const ROOM_PATTERNS: Array<[number, RegExp]> = [
  [3, /\btriple\b/],
  [2, /\bmulti\b/],
  [1, /\bsingle\b/],
];

const MONTH_PATTERNS: Array<[number, RegExp]> = [
  [12, /\b12\b/],
  [6, /\b6\b/],
  [3, /\b3\b/],
  [1, /\b1\b/],
];

export function packageSortKey(name: string): PackageSortKey {
  const n = name.toLowerCase();
  let roomTier = 1;
  for (const [tier, re] of ROOM_PATTERNS) {
    if (re.test(n)) {
      roomTier = tier;
      break;
    }
  }
  let months = 0;
  for (const [m, re] of MONTH_PATTERNS) {
    if (re.test(n)) {
      months = m;
      break;
    }
  }
  return { roomTier, months };
}

export function comparePackages(a: { name: string }, b: { name: string }): number {
  const ka = packageSortKey(a.name);
  const kb = packageSortKey(b.name);
  return ka.roomTier - kb.roomTier || kb.months - ka.months || a.name.localeCompare(b.name);
}
