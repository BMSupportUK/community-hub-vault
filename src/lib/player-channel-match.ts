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

export function normChannel(name: string): string {
  let s = name.toLowerCase();
  s = s.replace(/^\s*(?:\|?[a-z]{2,3}\s*[|:\-]\s*)+/, " "); // "UK: ", "|UK| ", "UK - "
  s = s.replace(/[^a-z0-9]+/g, " ");
  s = s.replace(/\b(?:fhd|uhd|hd|sd|4k|hevc|h265|raw|backup|vip|channel|tv)\b/g, " ");
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
  const pool = exact.length ? exact : playlist.filter((p) => {
    const n = normChannel(p);
    return n.length > 0 && (` ${n} `.includes(` ${want} `));
  });
  return [...pool].sort((a, b) => quality(b) - quality(a) || a.length - b.length);
}
