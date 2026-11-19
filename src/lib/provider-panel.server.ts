// Server only: signs in to the Xtream reseller panel (behind HTTP basic auth) and creates or extends lines.
const BASE = "https://footballfantasy26.com";
const MEMBER_ID = "767"; // BoroMedia reseller

function creds() {
  const u = process.env["PROVIDER_PANEL_USERNAME"], p = process.env["PROVIDER_PANEL_PASSWORD"];
  if (!u || !p) throw new Error("Provider panel login isn't set up");
  return { u, p };
}

class Panel {
  private cookies = new Map<string, string>();
  constructor(private auth: string) {}
  private store(r: Response) {
    const list = (r.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
    for (const c of list) { const [kv] = c.split(";"); const i = kv.indexOf("="); if (i > 0) this.cookies.set(kv.slice(0, i).trim(), kv.slice(i + 1)); }
  }
  async req(path: string, body?: URLSearchParams) {
    const r = await fetch(BASE + path, {
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
  const panel = new Panel("Basic " + btoa(`${u}:${p}`));
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
const panelError = (html: string) => /\$\.toast\("([^"]{3,200})"\)/.exec(html)?.[1] ?? null;

async function packageBouquets(panel: Panel, packageId: number) {
  const r = await panel.req(`/api.php?action=get_package&package_id=${packageId}`);
  const d = JSON.parse(r.text) as { result?: boolean; data?: { cost_credits?: number }; bouquets?: { id: string | number }[] };
  if (!d.result) throw new Error("The provider panel didn't recognise that package");
  return { bouquets: (d.bouquets ?? []).map((b) => String(b.id)), cost: Number(d.data?.cost_credits ?? 0) };
}

export async function panelFindLine(panel: Panel, username: string): Promise<string | null> {
  const want = username.trim().toLowerCase();
  for (let start = 0; start < 5000; start += 100) {
    const q = new URLSearchParams({ draw: "1", start: String(start), length: "100", id: "users" });
    const r = await panel.req(`/table_search.php?${q}`);
    const d = JSON.parse(r.text) as { data?: unknown[][]; recordsFiltered?: number | string };
    for (const row of d.data ?? []) {
      const name = /<strong>([^<]+)<\/strong>/.exec(String(row[1] ?? ""))?.[1] ?? String(row[1] ?? "");
      if (name.trim().toLowerCase() === want) return String(row[0]);
    }
    if (!d.data?.length || start + 100 >= Number(d.recordsFiltered ?? 0)) break;
  }
  return null;
}

export async function readLine(panel: Panel, id: string) {
  const r = await panel.req(`/user_reseller.php?id=${encodeURIComponent(id)}`);
  return { html: r.text, username: inputValue(r.text, "username"), password: inputValue(r.text, "password"), email: inputValue(r.text, "email"), exp: inputValue(r.text, "exp_date") };
}

/** Step 1 of a new line: the panel's own pre-made username. Saved before purchase so a retry never buys twice. */
export async function panelNewUsername(panel: Panel) {
  const r = await panel.req("/user_reseller.php");
  const name = inputValue(r.text, "username");
  if (!name) throw new Error("The provider panel didn't offer a new username");
  return name;
}

export async function panelCreateLine(panel: Panel, o: { username: string; email: string; packageId: number; note: string }) {
  const { bouquets } = await packageBouquets(panel, o.packageId);
  const body = new URLSearchParams({ username: o.username, email: o.email, member_id: MEMBER_ID, package: String(o.packageId), bouquets_selected: JSON.stringify(bouquets), reseller_notes: o.note, submit_user: "Purchase" });
  const r = await panel.req("/user_reseller.php", body);
  const id = await panelFindLine(panel, o.username);
  if (!id) throw new Error(panelError(r.text) ?? "The provider panel didn't create the line (check its credits)");
  const line = await readLine(panel, id);
  return { id, username: line.username || o.username, password: line.password, exp: line.exp };
}

export async function panelExtendLine(panel: Panel, o: { id: string; packageId: number }) {
  const before = await readLine(panel, o.id);
  const { bouquets } = await packageBouquets(panel, o.packageId);
  const body = new URLSearchParams({ edit: o.id, username: before.username, password: before.password, email: before.email || "", member_id: MEMBER_ID, package: String(o.packageId), bouquets_selected: JSON.stringify(bouquets), submit_user: "Purchase" });
  const r = await panel.req("/user_reseller.php", body);
  const after = await readLine(panel, o.id);
  if (!after.exp || after.exp === before.exp) throw new Error(panelError(r.text) ?? "The provider panel didn't extend the line (check its credits)");
  return { id: o.id, username: after.username, password: after.password, exp: after.exp };
}
