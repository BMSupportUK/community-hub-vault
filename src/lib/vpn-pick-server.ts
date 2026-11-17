export type VpnServer = { id: number; name: string; country_code: string; city: string; status: number; visible: number; cpu?: number };

/** Nearest country first (the box's own, then UK); within it the server with the least traffic on it right now (provider load figure), then the fewest of our customers. */
export function pickServer(list: VpnServer[], cc?: string | null, ours: Record<number, number> = {}): VpnServer | null {
  const want = [(cc ?? "").toUpperCase(), "GB", "UK", "NL", "BE", "FR"].filter(Boolean);
  for (const c of want) {
    const inC = list.filter((s) => s.country_code?.toUpperCase() === c).sort((a, b) => (a.cpu ?? 0) - (b.cpu ?? 0) || (ours[a.id] ?? 0) - (ours[b.id] ?? 0));
    if (inC.length) return inC[0];
  }
  return list[0] ?? null;
}

