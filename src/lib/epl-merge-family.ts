/**
 * Premier League split cards each carry one channel group. When merging,
 * cards from different groups (Premier League Hub vs Sky Sports vs team SD
 * channels) must never be joined, so each card is tagged with its family.
 */
export type EplFamily = "Premier League Hub" | "Sky Sports" | "Team Channels";

export function eplFamily(text: string): EplFamily | null {
  const t = String(text ?? "");
  if (/\bHub Premier\s*\d/i.test(t)) return "Premier League Hub";
  if (/\bSky Sports?\b/i.test(t)) return "Sky Sports";
  if (/\bEPL\s*ˢᴰ/i.test(t)) return "Team Channels";
  return null;
}

/** Families present among the given posts (ignores non-EPL posts). */
export function eplFamilies(texts: string[]): EplFamily[] {
  return [...new Set(texts.map(eplFamily).filter((f): f is EplFamily => !!f))];
}
