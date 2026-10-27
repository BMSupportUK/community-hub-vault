/** Recoverable PIN display values stay encrypted; only authorized server handlers decrypt. */
async function key(secret: string) {
  if (!secret) throw new Error("PIN storage is unavailable. Try again shortly.");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}
export async function encryptPin(pin: string, secret: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await key(secret), new TextEncoder().encode(pin));
  return [...iv, ...new Uint8Array(encrypted)].map(b => b.toString(16).padStart(2, "0")).join("");
}
export async function decryptPin(value: string, secret: string) {
  const bytes = Uint8Array.from(value.match(/.{2}/g) ?? [], h => parseInt(h, 16));
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes.slice(0, 12) }, await key(secret), bytes.slice(12));
  return new TextDecoder().decode(decrypted);
}