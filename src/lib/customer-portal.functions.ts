import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader, getRequestUrl, setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { ManualCredential } from "@/lib/manual-credentials-schema";
import { portalCodeSchema, portalLockAt, portalTokenSchema } from "@/lib/customer-portal";

const hex = (bytes: ArrayBuffer | Uint8Array) => Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
const hash = async (value: string) => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
async function hashPin(pin: string, salt: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
  return hex(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: new TextEncoder().encode(salt), iterations: 100_000 }, key, 256));
}

/** Public: email a one-use 24-hour login link to the portal owner. Always answers the same way. */
export const requestPortalLink = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ code: portalCodeSchema }).strict().parse(input))
  .handler(async ({ data }) => {
    setResponseHeader("cache-control", "no-store");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const ip = getRequestHeader("cf-connecting-ip") || "shared-preview";
    const [{ data: ipOk }, { data: codeOk }] = await Promise.all([
      supabaseAdmin.rpc("manual_credentials_throttle", { p_key: `portal-ip:${await hash(ip)}`, p_limit: 20 }),
      supabaseAdmin.rpc("manual_credentials_throttle", { p_key: `portal-code:${data.code}`, p_limit: 5 }),
    ]);
    if (!ipOk || !codeOk) throw new Error("Too many requests. Please try again in an hour.");
    const portal = await findPortal(supabaseAdmin, data.code);
    if (!portal) return { sent: true };
    const { data: user } = await supabaseAdmin.auth.admin.getUserById(portal.user_id);
    const email = user.user?.email;
    if (!email || !user.user?.email_confirmed_at) return { sent: true };
    // The portal address changes every 24 hours; the email always carries today's.
    const { data: currentCode } = await supabaseAdmin.rpc("portal_ensure_code", { p_user_id: portal.user_id });
    const token = hex(crypto.getRandomValues(new Uint8Array(32)));
    const { error } = await supabaseAdmin.rpc("portal_issue_link", { p_user_id: portal.user_id, p_token_hash: await hash(token) });
    if (error || !currentCode) throw new Error("We couldn't send your link. Please try again.");
    const { data: profile } = await supabaseAdmin.from("profiles").select("display_name").eq("id", portal.user_id).maybeSingle();
    const origin = getRequestUrl().origin;
    const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
    await sendTemplateEmail("customer-portal-link", email, {
      templateData: { name: profile?.display_name ?? undefined, loginUrl: `${origin}/portal/${currentCode}?t=${token}` },
      idempotencyKey: `portal-link-${await hash(token)}`,
    });
    return { sent: true };
  });

/** Current or previous (yesterday's) portal code identifies the customer. */
async function findPortal(admin: any, code: string): Promise<{ user_id: string } | null> {
  const { data } = await admin.from("customer_portals").select("user_id").or(`code.eq.${code},previous_code.eq.${code}`).limit(1).maybeSingle();
  return data ?? null;
}

/** Public: swap a valid 24-hour link for a sign-in token. Each opening locks again after one hour. */
export const redeemPortalLink = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ code: portalCodeSchema, token: portalTokenSchema }).strict().parse(input))
  .handler(async ({ data }) => {
    setResponseHeader("cache-control", "no-store");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const portal = await findPortal(supabaseAdmin, data.code);
    const { data: rows, error } = await supabaseAdmin.rpc("portal_redeem_link", { p_token_hash: await hash(data.token) });
    const row = Array.isArray(rows) ? rows[0] : null;
    if (error || !row || !portal || row.user_id !== portal.user_id) throw new Error("This login link has expired. Request a new one.");
    const { data: user } = await supabaseAdmin.auth.admin.getUserById(row.user_id);
    if (!user.user?.email) throw new Error("This portal is unavailable.");
    const { data: link, error: linkError } = await supabaseAdmin.auth.admin.generateLink({ type: "magiclink", email: user.user.email });
    if (linkError || !link.properties?.hashed_token || link.user?.id !== row.user_id) throw new Error("We couldn't sign you in. Request a new link.");
    return { tokenHash: link.properties.hashed_token, expiresAt: portalLockAt(row.expires_at as string) };
  });

/** Signed-in: show the customer's own app logins after their 6-digit PIN. First use sets the PIN. */
export const readPortalCredentials = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ pin: z.string().regex(/^\d{6}$/, "Enter a 6-digit PIN.") }).strict().parse(input))
  .handler(async ({ data, context }) => {
    setResponseHeader("cache-control", "no-store");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: user } = await supabaseAdmin.auth.admin.getUserById(context.userId);
    const email = user.user?.email?.trim().toLowerCase();
    if (!email) throw new Error("Your account has no email saved.");
    const key = await hash(email);
    const { data: access } = await supabaseAdmin.from("manual_credential_access").select("pin_salt").eq("email_key", key).maybeSingle();
    const salt = access?.pin_salt || hex(crypto.getRandomValues(new Uint8Array(24)));
    const { data: result, error } = await supabaseAdmin.rpc("portal_verify_pin", { p_email_key: key, p_pin_hash: await hashPin(data.pin, salt), p_pin_salt: salt });
    if (error) throw new Error("Secure access is temporarily unavailable.");
    if (result === "locked") throw new Error("Too many wrong PINs. Access is locked for one hour.");
    if (result === "invalid") throw new Error("Wrong PIN. After five wrong tries, access is locked for one hour.");
    const [{ data: site }, { data: manual }] = await Promise.all([
      supabaseAdmin.rpc("portal_credentials_for_user", { p_user_id: context.userId }),
      supabaseAdmin.rpc("manual_credentials_for_email", { p_email: email }),
    ]);
    const accounts = [...((site as unknown as ManualCredential[]) ?? []), ...((manual as unknown as ManualCredential[]) ?? [])];
    return { accounts, created: result === "created", expiresAt: new Date(Date.now() + 10 * 60_000).toISOString() };
  });
