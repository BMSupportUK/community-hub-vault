import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Server-side access to the editable automated messages and email overrides
 * (admin dashboard → Automated messages & emails).
 */
export interface EmailOverride {
  subject: string | null;
  body: string | null;
}

const TTL_MS = 60 * 1000;
let cache: { at: number; rows: Record<string, { subject: string | null; body: string | null }> } | null = null;

async function load() {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.rows;
  try {
    const { data } = await supabaseAdmin
      .from("automated_messages")
      .select("key, subject, body");
    const rows: Record<string, { subject: string | null; body: string | null }> = {};
    for (const row of (data ?? []) as { key: string; subject: string | null; body: string | null }[]) {
      rows[row.key] = { subject: row.subject, body: row.body };
    }
    cache = { at: Date.now(), rows };
    return rows;
  } catch {
    return cache?.rows ?? {};
  }
}

export function fillPlaceholders(text: string, values: Record<string, string>) {
  let out = text;
  for (const [name, value] of Object.entries(values)) out = out.split(`{${name}}`).join(value);
  return out;
}

/** Editable message text for a key, or the supplied fallback. */
export async function getAutomatedMessageServer(
  key: string,
  values: Record<string, string> = {},
  fallback = "",
): Promise<string> {
  const rows = await load();
  const body = rows[key]?.body?.trim() ? rows[key]!.body! : fallback;
  return fillPlaceholders(body, values);
}

/** Admin overrides for an email: subject and optional replacement body text. */
export async function getEmailOverride(name: string): Promise<EmailOverride> {
  const rows = await load();
  const row = rows[`email:${name}`];
  return { subject: row?.subject?.trim() || null, body: row?.body?.trim() || null };
}

/** Simple branded HTML/text pair used when an admin supplies their own wording. */
export function renderOverrideEmail(bodyText: string) {
  const paragraphs = bodyText
    .split(/\n{2,}/)
    .map((p) => `<p style="font-size:14px;color:#444;line-height:1.6;margin:0 0 12px">${p
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/\n/g, "<br />")}</p>`)
    .join("");
  const html = `<!doctype html><html><body style="background:#ffffff;font-family:Arial,sans-serif"><div style="max-width:560px;margin:0 auto;padding:24px">${paragraphs}<hr style="border-color:#eee;margin:24px 0" /><p style="font-size:12px;color:#999">BM Support</p></div></body></html>`;
  return { html, text: bodyText };
}
