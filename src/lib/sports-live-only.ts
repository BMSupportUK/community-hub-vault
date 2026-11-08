import { matchChannel, normChannel, BUILT_IN_ALIASES, type ChannelAlias } from "@/lib/player-channel-match";

/** Recorded/replay feeds are never a live event's channel. */
export const isReplayChannel = (name: string, category = "") => /\breplays?\b/i.test(name) || /\breplays?\b/i.test(category);

/** Index once per catalogue instead of normalising every playlist channel for
 * every event. The existing matcher still chooses/ranks the candidate names. */
export function createLiveChannelPinner(live: string[], aliases: ChannelAlias[] = []) {
  const exact = new Set(live.map((n) => n.toLowerCase()));
  const words = new Map<string, Set<string>>();
  const normalized = new Map<string, string[]>();
  const swaps = [...aliases, ...BUILT_IN_ALIASES].map((a) => ({ from: normChannel(a.from), to: normChannel(a.to) }));
  const alias = (value: string) => swaps.find((a) => a.from === value)?.to ?? value;
  for (const name of live) {
    const n = normChannel(name), key = alias(n);
    normalized.set(key, [...(normalized.get(key) ?? []), name]);
    for (const word of new Set(n.split(" "))) { const entries = words.get(word) ?? new Set<string>(); entries.add(name); words.set(word, entries); }
  }
  const resolved = new Map<string, string | null>();
  return (channels: string[]): string[] => {
    const out: string[] = [];
    for (const c of channels) {
      let pick: string | null;
      if (exact.has(c.toLowerCase()) || /^\s*channel\s+\d+\s*$/i.test(c) || /^\s*boxing\s+\d+/i.test(c)) pick = c;
      else if (resolved.has(c)) pick = resolved.get(c) ?? null;
      else {
        const want = alias(normChannel(c));
        const precise = normalized.get(want);
        const sets = want.split(" ").map((w) => words.get(w)).sort((a, b) => (a?.size ?? 0) - (b?.size ?? 0));
        const first = sets[0];
        const candidates = precise ?? (first ? [...first].filter((name) => sets.every((set) => set?.has(name))) : []);
        pick = matchChannel(c, candidates, aliases)[0] ?? null;
        resolved.set(c, pick);
      }
      if (pick && !out.includes(pick)) out.push(pick);
    }
    return out;
  };
}

/**
 * Pin each guide channel to the exact live playlist name so apps (which fall back to loose
 * word matching) can never land on a Replay feed. Daily "Channel NN" and "Boxing NN" labels keep
 * their own numbered rules in the apps; a channel with no live match is dropped.
 */
export function pinLiveChannels(channels: string[], live: string[], aliases: ChannelAlias[] = []): string[] {
  const exact = new Set(live.map((n) => n.toLowerCase()));
  const out: string[] = [];
  for (const c of channels) {
    let pick: string | null = c;
    if (!/^\s*channel\s+\d+\s*$/i.test(c) && !/^\s*boxing\s+\d+/i.test(c) && !exact.has(c.toLowerCase())) pick = matchChannel(c, live, aliases)[0] ?? null;
    if (pick && !out.includes(pick)) out.push(pick);
  }
  return out;
}
