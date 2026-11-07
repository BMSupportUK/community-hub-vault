import { matchChannel, type ChannelAlias } from "@/lib/player-channel-match";

/** Recorded/replay feeds are never a live event's channel. */
export const isReplayChannel = (name: string, category = "") => /\breplays?\b/i.test(name) || /\breplays?\b/i.test(category);

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
