// Keeps the issued eight-digit setup code on this device for its 2-hour life so a refresh shows the same code.
const TTL = 2 * 60 * 60 * 1000;
const key = (scope: string) => `bm-setup-code:${scope}`;

export function readSetupCode(scope: string): string | null {
  try {
    const raw = window.localStorage.getItem(key(scope));
    if (!raw) return null;
    const { code, at } = JSON.parse(raw) as { code: string; at: number };
    if (Date.now() - at > TTL) { window.localStorage.removeItem(key(scope)); return null; }
    return code;
  } catch { return null; }
}

export function writeSetupCode(scope: string, code: string | null) {
  try {
    if (code) window.localStorage.setItem(key(scope), JSON.stringify({ code, at: Date.now() }));
    else window.localStorage.removeItem(key(scope));
  } catch { /* storage unavailable */ }
}
