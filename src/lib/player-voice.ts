/** Turns a short voice-search clip from a BM Player app into text via Lovable AI. */
export const VOICE_MAX_BYTES = 1_200_000; // ~35s of 16 kHz mono WAV
const recent = new Map<string, number[]>();

/** At most 12 voice searches per device per minute. */
export function voiceAllowed(deviceId: string, now = Date.now()) {
  const list = (recent.get(deviceId) ?? []).filter((t) => now - t < 60_000);
  if (list.length >= 12) { recent.set(deviceId, list); return false; }
  list.push(now); recent.set(deviceId, list);
  return true;
}

export async function transcribeVoice(bytes: Uint8Array<ArrayBuffer>, mime: string, apiKey: string) {
  const form = new FormData();
  form.append("model", "openai/gpt-transcribe");
  form.append("file", new File([bytes], mime.includes("wav") ? "voice.wav" : "voice.webm", { type: mime }));
  form.append("response_format", "json");
  form.append("stream", "true");
  form.append("languages", "en");
  form.append("prompt", "A short TV search: a channel, film, series, team or sports event name.");
  const res = await fetch("https://ai.gateway.lovable.dev/v1/audio/transcriptions", {
    method: "POST", headers: { Authorization: `Bearer ${apiKey}` }, body: form,
  });
  if (!res.ok) {
    let message = "Voice search isn't available right now.";
    try { const j = await res.json(); message = j?.error?.message || j?.message || message; } catch { /* keep default */ }
    return { ok: false as const, status: res.status, message };
  }
  const raw = await res.text();
  let text = "", deltas = "";
  for (const line of raw.split(/\r?\n/)) {
    if (!line.startsWith("data:")) continue;
    const data = line.slice(5).trim();
    if (!data || data === "[DONE]") continue;
    try {
      const ev = JSON.parse(data);
      if (ev.type === "transcript.text.done" && typeof ev.text === "string") text = ev.text;
      else if (ev.type === "transcript.text.delta" && typeof ev.delta === "string") deltas += ev.delta;
    } catch { /* ignore partial lines */ }
  }
  if (!text && !raw.startsWith("data:")) { try { text = JSON.parse(raw).text ?? ""; } catch { /* not json */ } }
  return { ok: true as const, text: (text || deltas).trim().replace(/[.!?]+$/, "").slice(0, 200) };
}
