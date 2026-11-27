// Server only: signs in to the Xtream reseller panel (behind HTTP basic auth) and creates or extends lines.
import { normalisePanelUrl } from "./provider-panel-url";
import { decryptPin, encryptPin } from "./enabler-pin-crypto.server";

const DEFAULT_PANEL_URL = "https://footballfantasy26.com";
const panelKey = () => process.env["PROVIDER_PANEL_PASSWORD"] ?? "";

/** Saved panel address, unscrambled on the server only; falls back to the built-in address. */
export async function panelBase(): Promise<string> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.from("provider_panel_settings").select("url_enc").eq("id", true).maybeSingle();
    const v = data?.url_enc ? await decryptPin(data.url_enc, panelKey()) : null;
    return (v && normalisePanelUrl(v)) || DEFAULT_PANEL_URL;
  } catch { return DEFAULT_PANEL_URL; }
}
export async function savePanelBase(url: string, userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const url_enc = await encryptPin(url, panelKey());
  const { error } = await supabaseAdmin.from("provider_panel_settings").upsert({ id: true, url_enc, updated_at: new Date().toISOString(), updated_by: userId });
  if (error) throw new Error("Could not save the address. Try again.");
}
/** Owner screen only ever sees a masked hint, e.g. "foo•••••.com". */
export function maskPanelUrl(url: string) {
  const host = new URL(url).hostname, dot = host.lastIndexOf(".");
  const name = dot > 0 ? host.slice(0, dot) : host, tld = dot > 0 ? host.slice(dot) : "";
  return name.slice(0, 3) + "•".repeat(Math.max(3, name.length - 3)) + tld;
}

const MEMBER_ID = "767"; // BoroMedia reseller

function creds() {
  const u = process.env["PROVIDER_PANEL_USERNAME"], p = process.env["PROVIDER_PANEL_PASSWORD"];
  if (!u || !p) throw new Error("Provider panel login isn't set up");
  return { u, p };
}

class Panel {
  private cookies = new Map<string, string>();
  constructor(private auth: string, private base: string) {}
  private store(r: Response) {
    const list = (r.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
    for (const c of list) { const [kv] = c.split(";"); const i = kv.indexOf("="); if (i > 0) this.cookies.set(kv.slice(0, i).trim(), kv.slice(i + 1)); }
  }
  async req(path: string, body?: URLSearchParams) {
    const r = await fetch(this.base + path, {
      method: body ? "POST" : "GET",
      redirect: "manual",
      headers: {
        Authorization: this.auth,
        Cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; "),
        "User-Agent": "Mozilla/5.0 BM Support",
        ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      },
      body,
    });
    this.store(r);
    const text = await r.text();
    if (r.status >= 400) throw new Error(`Provider panel said ${r.status}`);
    return { status: r.status, location: r.headers.get("location") ?? "", text };
  }
}

export async function panelLogin() {
  const { u, p } = creds();
  const panel = new Panel("Basic " + btoa(`${u}:${p}`), await panelBase());
  await panel.req("/login.php");
  const r = await panel.req("/login.php", new URLSearchParams({ username: u, password: p, referrer: "" }));
  if (!(r.status === 302 && /reseller|dashboard/.test(r.location))) throw new Error("Couldn't sign in to the provider panel — check the saved panel login");
  return panel;
}

const attr = (tag: string, name: string) => new RegExp(`${name}="([^"]*)"`).exec(tag)?.[1] ?? "";
const inputValue = (html: string, name: string) => {
  const tag = new RegExp(`<input[^>]*name="${name}"[^>]*>`).exec(html)?.[0];
  return tag ? attr(tag, "value").replace(/&amp;/g, "&").replace(/&quot;/g, '"') : "";
};
const unescape = (v: string) => v.replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const textValue = (html: string, name: string) => unescape(new RegExp(`<textarea[^>]*name="${name}"[^>]*>([\\s\\S]*?)</textarea>`).exec(html)?.[1]?.trim() ?? "");
export const selectOptions = (html: string, id: string) => {
  const box = new RegExp(`<select[^>]*id="${id}"[^>]*>([\\s\\S]*?)</select>`).exec(html)?.[1] ?? "";
  return [...box.matchAll(/<option[^>]*value="([^"]*)"/g)].map((m) => unescape(m[1] ?? "").trim()).filter(Boolean);
};
// The form's own script always contains the "add IP / add user-agent" toasts, so those are never the panel's answer.
const FORM_TOASTS = /^please enter a (valid ip address|user-agent)\.?$/i;
export const panelError = (html: string) => [...html.matchAll(/\$\.toast\("([^"]{3,200})"\)/g)].map((m) => m[1] ?? "").find((t) => !FORM_TOASTS.test(t.trim())) ?? null;

async function packageBouquets(panel: Panel, packageId: number) {
  const r = await panel.req(`/api.php?action=get_package&package_id=${packageId}`);
  const d = JSON.parse(r.text) as { result?: boolean; data?: { cost_credits?: number }; bouquets?: { id: string | number }[] };
  if (!d.result) throw new Error("The provider panel didn't recognise that package");
  return { bouquets: (d.bouquets ?? []).map((b) => String(b.id)), cost: Number(d.data?.cost_credits ?? 0) };
}

export async function panelFindLine(panel: Panel, username: string): Promise<string | null> {
  return (await panelFindRow(panel, username))?.id ?? null;
}

/** The panel's user list holds the full expiry ("YYYY-MM-DD HH:MM:SS"); the edit form only shows the date. */
export async function panelFindRow(panel: Panel, username: string): Promise<{ id: string; exp: string } | null> {
  const want = username.trim().toLowerCase();
  for (let start = 0; start < 5000; start += 100) {
    const q = new URLSearchParams({ draw: "1", start: String(start), length: "100", id: "users" });
    const r = await panel.req(`/table_search.php?${q}`);
    const d = JSON.parse(r.text) as { data?: unknown[][]; recordsFiltered?: number | string };
    for (const row of d.data ?? []) {
      const name = /<strong>([^<]+)<\/strong>/.exec(String(row[1] ?? ""))?.[1] ?? String(row[1] ?? "");
      if (name.trim().toLowerCase() === want) return { id: String(row[0]), exp: /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(String(row[7] ?? "").trim()) ? String(row[7]).trim() : "" };
    }
    if (!d.data?.length || start + 100 >= Number(d.recordsFiltered ?? 0)) break;
  }
  return null;
}

export async function readLine(panel: Panel, id: string) {
  const r = await panel.req(`/user_reseller.php?id=${encodeURIComponent(id)}`);
  const username = inputValue(r.text, "username");
  const dateOnly = inputValue(r.text, "exp_date");
  // Read the exact expiry time from the user list once the line exists.
  const row = username ? await panelFindRow(panel, username) : null;
  const exp = row?.exp && row.exp.startsWith(dateOnly) ? row.exp : row?.exp || dateOnly;
  return { html: r.text, username, password: inputValue(r.text, "password"), email: inputValue(r.text, "email"), exp };
}

/** Step 1 of a new line: the panel's own pre-made username. Saved before purchase so a retry never buys twice. */
export async function panelNewUsername(panel: Panel) {
  const r = await panel.req("/user_reseller.php");
  const name = inputValue(r.text, "username");
  if (!name) throw new Error("The provider panel didn't offer a new username");
  return name;
}

/** "name@x.com" -> "name1@x.com" (used when the panel already has the customer's email). */
export function bumpEmail(email: string) {
  const at = email.lastIndexOf("@");
  return at > 0 ? `${email.slice(0, at)}1${email.slice(at)}` : `${email}1`;
}
const emailTaken = (msg: string | null) => !!msg && /e-?mail/i.test(msg) && /(already|exist|taken|in use|used)/i.test(msg);

export async function panelCreateLine(panel: Panel, o: { username: string; email: string; packageId: number; note: string }) {
  const { bouquets } = await packageBouquets(panel, o.packageId);
  const buy = (email: string) => panel.req("/user_reseller.php", new URLSearchParams({ username: o.username, email, member_id: MEMBER_ID, package: String(o.packageId), bouquets_selected: JSON.stringify(bouquets), reseller_notes: o.note, submit_user: "Purchase" }));
  let email = o.email;
  let r = await buy(email);
  let id = await panelFindLine(panel, o.username);
  let emailBumped = false;
  if (!id && emailTaken(panelError(r.text))) {
    email = bumpEmail(o.email);
    emailBumped = true;
    r = await buy(email);
    id = await panelFindLine(panel, o.username);
  }
  if (!id) throw new Error(panelError(r.text) ?? "The provider panel didn't create the line (check its credits)");
  const line = await readLine(panel, id);
  return { id, username: line.username || o.username, password: line.password, exp: line.exp, email, emailBumped };
}

export async function panelExtendLine(panel: Panel, o: { id: string; packageId: number }) {
  const before = await readLine(panel, o.id);
  const { bouquets } = await packageBouquets(panel, o.packageId);
  // Send exactly what the panel's own form sends; keep any existing IP / user-agent / MAC locks untouched.
  const body = new URLSearchParams({ edit: o.id, username: before.username, password: before.password, email: before.email || "", member_id: MEMBER_ID, package: String(o.packageId), bouquets_selected: JSON.stringify(bouquets), mac_address_mag: inputValue(before.html, "mac_address_mag"), mac_address_e2: inputValue(before.html, "mac_address_e2"), reseller_notes: textValue(before.html, "reseller_notes"), submit_user: "Purchase" });
  for (const ip of selectOptions(before.html, "allowed_ips")) body.append("allowed_ips[]", ip);
  for (const ua of selectOptions(before.html, "allowed_ua")) body.append("allowed_ua[]", ua);
  const r = await panel.req("/user_reseller.php", body);
  const after = await readLine(panel, o.id);
  if (!after.exp || after.exp === before.exp) throw new Error(panelError(r.text) ?? "The provider panel didn't extend the line (check its credits)");
  return { id: o.id, username: after.username, password: after.password, exp: after.exp };
}

/** Reseller credit balance shown on the provider panel dashboard. */
export async function panelCredits() {
  const panel = await panelLogin();
  const r = await panel.req("/api.php?action=reseller_dashboard");
  const n = Number((JSON.parse(r.text) as { credits?: string | number }).credits);
  if (!Number.isFinite(n)) throw new Error("Panel credits unreadable");
  return n.toFixed(2);
}
