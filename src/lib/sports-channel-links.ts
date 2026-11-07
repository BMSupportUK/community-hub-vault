/**
 * Per-guide "Channel linking" rules, set on each sports guide in the admin
 * editor and applied by the website before guides reach BM Player, so new
 * naming styles never need an app release. `country` is enforced by the apps
 * (via each event's `channelCountry`) and by testChannelLinks below.
 */
import { matchChannel, normChannel, type ChannelAlias } from "./player-channel-match";

export type ChannelLinks = {
  /** Guide says "Channel 07" → the playlist channel whose name starts "07 |". */
  numbered?: boolean;
  /** Only link channels tagged with this country, e.g. "US" (never "AU"). */
  country?: string;
  /** Word swaps applied to guide channel names, e.g. "CYMRU FOOTBALL" → "Cymru Football event". */
  replace?: { from: string; to: string }[];
  /** Playlist Live TV category the guide's channels live in, e.g. "UK | Cymru TV". */
  category?: string;
};

export function readChannelLinks(raw: unknown): ChannelLinks {
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;
  const country = typeof r.country === "string" ? r.country.trim().toUpperCase().slice(0, 12) : "";
  const replace = Array.isArray(r.replace)
    ? r.replace
        .map((x) => ({ from: String((x as { from?: unknown })?.from ?? "").trim(), to: String((x as { to?: unknown })?.to ?? "").trim() }))
        .filter((x) => x.from)
        .slice(0, 20)
    : [];
  const category = typeof r.category === "string" ? r.category.trim().slice(0, 120) : "";
  return { numbered: r.numbered === true, ...(category ? { category } : {}), ...(country ? { country } : {}), ...(replace.length ? { replace } : {}) };
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Rewrite one guide channel name with the guide's rules. */
export function applyChannelLinks(channel: string, links: ChannelLinks): string {
  let c = channel.trim();
  for (const r of links.replace ?? []) c = c.replace(new RegExp(esc(r.from), "gi"), r.to);
  if (links.numbered) {
    const m = /(\d{1,4})\s*$/.exec(c) ?? /(\d{1,4})/.exec(c);
    if (m) c = m[1];
  }
  return c.trim();
}

/** True when a playlist channel name carries the country tag (e.g. "US | Paramount+ 3"). */
export function channelInCountry(name: string, country?: string | null): boolean {
  if (!country) return true;
  return new RegExp(`(^|[^A-Z0-9])${esc(country.toUpperCase())}([^A-Z0-9]|$)`).test(name.toUpperCase());
}

/** Admin Test button: what each guide channel would link to in the pasted channel list. */
export function testChannelLinks(guideChannels: string[], playlist: string[], links: ChannelLinks, aliases: ChannelAlias[] = []) {
  return guideChannels.map((g) => {
    const rewritten = applyChannelLinks(g, links);
    const found = matchChannel(rewritten, playlist, aliases).filter((p) => channelInCountry(p, links.country));
    return { guide: g, rewritten, found };
  });
}

/**
 * Link one guide channel to a real channel inside the guide's playlist category:
 * normal matching first, then by number ("CYMRU FOOTBALL 3" → the category's channel numbered 3).
 * Returns the exact playlist name, or null when the category has no such channel.
 */
export function resolveInCategory(channel: string, list: string[], links: ChannelLinks, aliases: ChannelAlias[] = []): string | null {
  if (!list.length) return null;
  const rewritten = applyChannelLinks(channel, links);
  const allowed = list.filter((p) => channelInCountry(p, links.country));
  const found = matchChannel(rewritten, allowed, aliases);
  if (found.length) return found[0];
  const m = /(?:^|\s)(\d{1,4})\s*$/.exec(rewritten);
  if (!m) return allowed.length === 1 ? allowed[0] : null;
  const n = Number(m[1]);
  // Only the feed label before | supplies its number, never a programme's
  // year, episode, start time or 4K suffix. Mixed categories need brand parity.
  const label = (name: string) => name.split("|").find((part) => /(?:^|\s)\d{1,4}(?:\s|$)/.test(part.trim()))?.trim() ?? name.split("|")[0].trim();
  const family = (name: string) => normChannel(name.replace(/(?:^|\s)\d{1,4}(?=\s|$)/g, " "))
    .replace(/\b(?:event|match)\b/g, "").replace(/\s+/g, "").replace(/tv$/, "");
  const wantedFamily = family(rewritten);
  const candidates = allowed.filter((p) => {
    const number = /(?:^|\s)(\d{1,4})(?:\s|$)/.exec(label(p));
    return number != null && Number(number[1]) === n;
  });
  const sameFamily = candidates.filter((p) => family(label(p)) === wantedFamily);
  if (sameFamily.length) return sameFamily[0];
  // Renamed single-brand categories (e.g. Cymru) can still resolve by number;
  // conflicting brands with the same number are never guessed.
  return candidates.length === 1 ? candidates[0] : null;
}
