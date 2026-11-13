/** Spoken welcome for the BM Player linked-device screen: a British female voice greeting the customer by username. */
export const WELCOME_VOICE_VERSION = "v4";
const recent = new Map<string, number>();

/** Turns a typed username into something a voice reads naturally: separators become pauses, camelCase and letter/number runs split into words. */
export function spokenName(username: string | null | undefined) {
  return (username ?? "")
    .replace(/[^\p{L}\p{N} ._'-]/gu, "")
    .replace(/[_.'-]+/g, " ")
    .replace(/(\p{Ll})(\p{Lu})/gu, "$1 $2")
    .replace(/(\p{L})(\p{N})/gu, "$1 $2")
    .replace(/(\p{N})(\p{L})/gu, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40);
}

/** Greeting text; names are trimmed to letters, numbers and simple punctuation so nothing odd is spoken. */
export function welcomeText(username: string | null | undefined) {
  const name = spokenName(username);
  return name
    ? `Welcome to BM Player, ${name}. Your device is linked. Enjoy watching.`
    : "Welcome to BM Player. Your device is linked. Enjoy watching.";
}

/** One welcome per device every 30 seconds (it is only asked for once per full app start). */
export function welcomeAllowed(deviceId: string, now = Date.now()) {
  const last = recent.get(deviceId);
  if (last && now - last < 30_000) return false;
  recent.set(deviceId, now);
  return true;
}

export async function welcomeCacheKey(text: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${WELCOME_VOICE_VERSION}|${text}`));
  return `welcome/${[...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("")}.mp3`;
}

/** Makes the MP3 clip through ElevenLabs (British female voice "Alice"). */
export async function synthWelcome(text: string, apiKey: string) {
  const res = await fetch("https://api.elevenlabs.io/v1/text-to-speech/Xb7hH8MSUJpSbSDYk0k2?output_format=mp3_44100_128", {
    method: "POST",
    headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ text, model_id: "eleven_multilingual_v2", voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.4, use_speaker_boost: true } }),
  });
  if (!res.ok) return { ok: false as const, status: res.status };
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.length < 1000) return { ok: false as const, status: 502 };
  return { ok: true as const, bytes };
}

export function toBase64(bytes: Uint8Array) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
