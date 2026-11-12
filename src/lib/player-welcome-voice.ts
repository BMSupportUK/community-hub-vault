/** Spoken welcome for the BM Player linked-device screen: a British female voice greeting the customer by username. */
export const WELCOME_VOICE_VERSION = "v2";
const recent = new Map<string, number>();

/** Greeting text; names are trimmed to letters, numbers and simple punctuation so nothing odd is spoken. */
export function welcomeText(username: string | null | undefined) {
  const name = (username ?? "").replace(/[^\p{L}\p{N} ._'-]/gu, "").trim().slice(0, 40);
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
  return `welcome/${[...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("")}.wav`;
}

/** Makes the WAV clip through Lovable AI text-to-speech (OpenAI, female "shimmer" voice, steered to a British accent). */
export async function synthWelcome(text: string, apiKey: string) {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/audio/speech", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "openai/gpt-4o-mini-tts",
      voice: "shimmer",
      input: text,
      instructions: "Speak warmly and cheerfully with a natural British English accent.",
      response_format: "wav",
      stream_format: "audio",
    }),
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
