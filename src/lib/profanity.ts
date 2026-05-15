import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Default UK profanity / slur list used to censor chat messages.
 * Stored lowercased, matched as whole words (with letter/symbol leetspeak tolerance).
 * Admins can extend this via the Admin → Word filter page (stored in app_settings).
 */
export const DEFAULT_UK_PROFANITY: string[] = [
  // Core swears
  "arse", "arsehole", "arsehat", "arsewipe",
  "bastard", "bellend", "bint", "bloody",
  "bollocks", "bollox", "bugger", "bullshit",
  "cock", "cockhead", "cocksucker", "cobblers",
  "crap", "cunt", "cunting", "damn",
  "dick", "dickhead", "dildo", "douche", "douchebag",
  "fanny", "feck", "fanny", "fuck", "fucker", "fucking", "fucked", "fuckwit", "fuckface", "fuckhead", "fuckoff", "motherfucker", "mofo",
  "git", "gobshite", "goon", "knob", "knobhead", "knobend",
  "minger", "munter", "muppet", "muppetry",
  "nob", "nobhead", "numpty",
  "pillock", "piss", "pissed", "pisshead", "pissflap", "pissflaps", "pisstake", "plonker", "prat", "prick", "pussy",
  "scrubber", "shag", "shagger", "shit", "shite", "shitter", "shitting", "shithead", "shitbag", "shitfaced", "shithouse", "shitshow", "slag", "slapper", "slut", "smegma", "sod", "sodding",
  "tit", "tits", "titty", "titties", "tosser", "twat", "twatface", "twonk",
  "wank", "wanker", "wanking", "whore",
  // Slurs / strongly offensive (kept censored regardless)
  "chav", "spaz", "spastic", "retard", "retarded",
  "paki", "wog", "coon", "kike", "gypo", "gippo", "pikey",
  "tranny", "faggot", "fag", "dyke", "homo", "queer",
  "nonce", "paedo", "pedo",
];

const STORE_KEY = "profanity_words";

let cachedExtra: string[] | null = null;
const listeners = new Set<() => void>();

function notify() {
  for (const l of listeners) l();
}

export function getProfanityWords(): string[] {
  const all = [...DEFAULT_UK_PROFANITY, ...(cachedExtra ?? [])];
  return Array.from(new Set(all.map((w) => w.toLowerCase().trim()).filter(Boolean)));
}

export function getCustomProfanityWords(): string[] {
  return [...(cachedExtra ?? [])];
}

let loadingPromise: Promise<void> | null = null;
let realtimeWired = false;

async function fetchExtraWords() {
  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", STORE_KEY)
    .maybeSingle();
  const raw = (data?.value as { words?: unknown } | null)?.words;
  cachedExtra = Array.isArray(raw)
    ? raw.filter((w): w is string => typeof w === "string").map((w) => w.toLowerCase().trim()).filter(Boolean)
    : [];
  notify();
}

export function ensureProfanityLoaded(): Promise<void> {
  if (cachedExtra !== null) return Promise.resolve();
  if (!loadingPromise) loadingPromise = fetchExtraWords().catch(() => { cachedExtra = []; });
  if (!realtimeWired) {
    realtimeWired = true;
    try {
      supabase
        .channel("app_settings_profanity")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "app_settings", filter: `key=eq.${STORE_KEY}` },
          () => { void fetchExtraWords(); },
        )
        .subscribe();
    } catch {}
  }
  return loadingPromise;
}

export async function saveCustomProfanityWords(words: string[]): Promise<void> {
  const cleaned = Array.from(
    new Set(words.map((w) => w.toLowerCase().trim()).filter((w) => w.length > 0 && w.length <= 64)),
  );
  const { error } = await supabase
    .from("app_settings")
    .upsert(
      { key: STORE_KEY, value: { words: cleaned }, updated_at: new Date().toISOString() },
      { onConflict: "key" },
    );
  if (error) throw error;
  cachedExtra = cleaned;
  notify();
}

export function useProfanityWords() {
  const [, force] = useState(0);
  useEffect(() => {
    void ensureProfanityLoaded();
    const cb = () => force((n) => n + 1);
    listeners.add(cb);
    return () => { listeners.delete(cb); };
  }, []);
  return { words: getProfanityWords(), custom: getCustomProfanityWords() };
}

/**
 * Map letters → regex character class so "fuck", "f*ck", "f.uck", "fück", "f u c k" all match.
 */
const LEET: Record<string, string> = {
  a: "[a4@àáâäåα]",
  b: "[b8ß]",
  c: "[cçčk]",
  d: "[d]",
  e: "[e3èéêë]",
  f: "[fph]",
  g: "[g69]",
  h: "[h#]",
  i: "[i1!líîï|]",
  j: "[j]",
  k: "[kc]",
  l: "[l1!|]",
  m: "[m]",
  n: "[nñ]",
  o: "[o0øóôö]",
  p: "[p]",
  q: "[q]",
  r: "[r]",
  s: "[s5$z]",
  t: "[t7+]",
  u: "[uüùúû]",
  v: "[v]",
  w: "[w]",
  x: "[x]",
  y: "[y]",
  z: "[z2s]",
};

function buildPattern(word: string): RegExp {
  const chars = word.toLowerCase().split("").map((c) => LEET[c] ?? c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  // Allow optional separator (space, dot, dash, underscore, asterisk) between letters.
  const inner = chars.join("[\\s._\\-*]?");
  // Word boundary using non-letter lookarounds (so it still censors "fucker" → "******").
  return new RegExp(`(?<![a-z0-9])${inner}(?![a-z0-9])`, "gi");
}

let compiledKey = "";
let compiled: RegExp[] = [];

function getCompiled(): RegExp[] {
  const list = getProfanityWords();
  const key = list.join("|");
  if (key !== compiledKey) {
    compiledKey = key;
    compiled = list.map(buildPattern);
  }
  return compiled;
}

export function censorText(input: string): string {
  if (!input) return input;
  let out = input;
  for (const re of getCompiled()) {
    out = out.replace(re, (match) => "*".repeat(match.replace(/\s/g, "").length));
  }
  return out;
}

/** True if text contains any blocked word. */
export function containsProfanity(input: string): boolean {
  if (!input) return false;
  return getCompiled().some((re) => { re.lastIndex = 0; return re.test(input); });
}