/**
 * Shared rules for matching sports-guide channel names to playlist channel
 * names. Mirrored in tv-player MainActivity.normChannel/matchChannel — keep
 * both in step.
 */
export type ChannelAlias = { from: string; to: string };

export const BUILT_IN_ALIASES: ChannelAlias[] = [
  { from: "sky sports pl", to: "sky sports premier league" },
  { from: "sky sports me", to: "sky sports main event" },
  { from: "sky sports f1", to: "sky sports formula 1" },
  { from: "bt sport 1", to: "tnt sports 1" },
  { from: "bt sport 2", to: "tnt sports 2" },
  { from: "bt sport 3", to: "tnt sports 3" },
  { from: "bt sport 4", to: "tnt sports 4" },
];

const COUNTRY = "uk|gb|usa|us|ire|ie|ireland|au|aus|australia|ca|canada|za|south africa|nz|int";
const NOISE = "fhd|uhd|hd|sd|4k|hevc|h265|raw|backup|vip|channel|tv";

export function normChannel(name: string): string {
  let s = name.toLowerCase();
  s = s.replace(/[^a-z0-9+]+/g, " ").replace(/\+/g, " plus ");
  s = s.replace(/([a-z])(\d)/g, "$1 $2").replace(/(\d)([a-z])/g, "$1 $2"); // "dazn1" -> "dazn 1"
  s = s.replace(new RegExp(`\\b(?:${COUNTRY}|${NOISE})\\b`, "g"), " ");
  s = s.replace(/\bsports\b/g, "sport").replace(/\b0+(\d)/g, "$1"); // "Sports"="Sport", "01"="1"
  s = s.replace(/\bcoupang\s+play\b/g, "coupang"); // Same numbered Sports Pass feeds under either provider label.
  return s.replace(/\s+/g, " ").trim();
}

function applyAlias(n: string, aliases: ChannelAlias[]): string {
  for (const a of aliases) if (normChannel(a.from) === n) return normChannel(a.to);
  return n;
}

const quality = (name: string) => /fhd|1080/i.test(name) ? 3 : /\bhd\b/i.test(name) ? 2 : /uhd|4k/i.test(name) ? 1 : 0;

/** Return matching playlist names, best first. Empty when nothing matches. */
export function matchChannel(guideName: string, playlist: string[], aliases: ChannelAlias[] = []): string[] {
  const all = [...aliases, ...BUILT_IN_ALIASES];
  const want = applyAlias(normChannel(guideName), all);
  if (!want) return [];
  const exact = playlist.filter((p) => applyAlias(normChannel(p), all) === want);
  if (exact.length) return [...exact].sort((a, b) => quality(b) - quality(a) || a.length - b.length);
  // Every word of the guide name appears in the playlist name (any order); fewest extra words first.
  const words = want.split(" ");
  const guideHasNumber = words.some((w) => /^\d+$/.test(w));
  const scored = playlist.map((p) => {
    const t = normChannel(p).split(" ");
    const numberedFeed = !guideHasNumber && t.some((w) => /^\d+$/.test(w));
    return { p, extra: !numberedFeed && words.every((w) => t.includes(w)) ? t.length - words.length : -1 };
  }).filter((x) => x.extra >= 0);
  return scored.sort((a, b) => a.extra - b.extra || quality(b.p) - quality(a.p) || a.p.length - b.p.length).map((x) => x.p);
}
