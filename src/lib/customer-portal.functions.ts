import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader, setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { ManualCredential } from "@/lib/manual-credentials-schema";
import { portalCodeSchema, portalLoginCodeSchema } from "@/lib/customer-portal";

const hex = (bytes: ArrayBuffer | Uint8Array) => Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
const hash = async (value: string) => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
async function hashPin(pin: string, salt: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
  return hex(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: new TextEncoder().encode(salt), iterations: 100_000 }, key, 256));
}

/** Public: email a 24-hour login code to the portal owner. */
export const requestPortalCode = createServerFn({ method: "POST" })
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
    const { issuePortalCode } = await import("@/lib/customer-portal-code.server");
    await issuePortalCode(supabaseAdmin, portal.user_id, email);
    return { sent: true };
  });

/** Current or previous (yesterday's) portal code identifies the customer. */
async function findPortal(admin: any, code: string): Promise<{ user_id: string } | null> {
  const { data } = await admin.from("customer_portals").select("user_id").or(`code.eq.${code},previous_code.eq.${code}`).limit(1).maybeSingle();
  return data ?? null;
}

/** Public: verify the entered email code before creating a customer session. */
export const redeemPortalCode = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ code: portalCodeSchema, loginCode: portalLoginCodeSchema }).strict().parse(input))
  .handler(async ({ data }) => {
    setResponseHeader("cache-control", "no-store");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const portal = await findPortal(supabaseAdmin, data.code);
    const { verifyPortalCode } = await import("@/lib/customer-portal-code.server");
    const expiresAt = await verifyPortalCode(supabaseAdmin, portal?.user_id ?? null, data.loginCode);
    if (!portal) throw new Error("Invalid or expired code. Request a new code.");
    const { data: user } = await supabaseAdmin.auth.admin.getUserById(portal.user_id);
    if (!user.user?.email) throw new Error("This portal is unavailable.");
    const { data: link, error: linkError } = await supabaseAdmin.auth.admin.generateLink({ type: "magiclink", email: user.user.email });
    if (linkError || !link.properties?.hashed_token || link.user?.id !== portal.user_id) throw new Error("We couldn't sign you in. Request a new code.");
    return { tokenHash: link.properties.hashed_token, expiresAt };
  });

/** Signed-in: show the customer's own app logins after their 6-digit PIN. First use sets the PIN. */
export const readPortalCredentials = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ pin: z.string().regex(/^\d{6}$/, "Enter a 6-digit PIN."), newPin: z.string().regex(/^\d{6}$/, "Your new PIN must be 6 digits.").optional() }).strict().parse(input))
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
    const { data: flag } = await supabaseAdmin.from("manual_credential_access").select("pin_must_change").eq("email_key", key).maybeSingle();
    if (flag?.pin_must_change) {
      // A PIN sent in a ticket is temporary: logins stay hidden until the customer picks their own.
      if (!data.newPin) return { mustChange: true as const, accounts: [], qdCodes: [], created: false, expiresAt: new Date().toISOString() };
      if (data.newPin === data.pin) throw new Error("Choose a new PIN that is different from the one we sent you.");
      const newSalt = hex(crypto.getRandomValues(new Uint8Array(24)));
      const { error: upErr } = await supabaseAdmin.from("manual_credential_access")
        .update({ pin_hash: await hashPin(data.newPin, newSalt), pin_salt: newSalt, pin_must_change: false, pin_attempts: 0, pin_locked_until: null })
        .eq("email_key", key);
      if (upErr) throw new Error("We couldn't save your new PIN. Please try again.");
    }
    const [{ data: site }, { data: manual }, { data: qd }] = await Promise.all([
      supabaseAdmin.rpc("portal_credentials_for_user", { p_user_id: context.userId }),
      supabaseAdmin.rpc("manual_credentials_for_email", { p_email: email }),
      supabaseAdmin.from("qd_dns_codes").select("id,label,code,notes").order("label"),
    ]);
    // Every source is read so one failing still shows the others; the same login appears once,
    // keeping the copy that has a password and the latest expiry.
    const byLogin = new Map<string, ManualCredential>();
    for (const a of [...((site as unknown as ManualCredential[]) ?? []), ...((manual as unknown as ManualCredential[]) ?? [])]) {
      const key = (a.login ?? "").trim().toLowerCase() || `id:${a.id}`;
      const prev = byLogin.get(key);
      if (!prev) { byLogin.set(key, a); continue; }
      byLogin.set(key, {
        ...prev,
        password: prev.password || a.password,
        expiresAt: [prev.expiresAt, a.expiresAt].filter(Boolean).sort().pop() ?? null,
        name: prev.name || a.name,
        accountType: prev.accountType || a.accountType,
      });
    }
    const accounts = [...byLogin.values()];
    const qdCodes = (qd ?? []).map((q) => ({ id: String(q.id), label: String(q.label), code: String(q.code), notes: q.notes ? String(q.notes) : null }));
    return { mustChange: false as const, accounts, qdCodes, created: result === "created", expiresAt: new Date(Date.now() + 10 * 60_000).toISOString() };
  });

/** Signed-in customer: reset their own app-logins PIN and alert staff. The next PIN they enter becomes the new one. */
export const requestPortalPinReset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    setResponseHeader("cache-control", "no-store");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: ok } = await supabaseAdmin.rpc("manual_credentials_throttle", { p_key: `portal-pin-reset:${context.userId}`, p_limit: 3 });
    if (!ok) throw new Error("Too many reset requests. Please try again in an hour.");
    const { data: user } = await supabaseAdmin.auth.admin.getUserById(context.userId);
    const email = user.user?.email?.trim().toLowerCase();
    if (!email) throw new Error("Your account has no email saved. Please contact support.");
    const key = await hash(email);
    const { data: cleared } = await supabaseAdmin
      .from("manual_credential_access")
      .update({ pin_hash: null, pin_salt: null, pin_attempts: 0, pin_locked_until: null })
      .eq("email_key", key)
      .not("pin_hash", "is", null)
      .select("email_key");
    if (!cleared?.length) throw new Error("You have not set a PIN yet — the first PIN you enter becomes your PIN.");
    const { data: me } = await supabaseAdmin.from("profiles").select("username").eq("id", context.userId).maybeSingle();
    const who = (me as { username?: string } | null)?.username || email;
    try {
      await supabaseAdmin.from("staff_notifications").insert({
        kind: "pin_reset",
        title: "Customer reset their app-logins PIN",
        body: `${who} asked to reset the PIN on their app logins. Their old PIN is cleared; the next PIN they enter becomes the new one.`,
        link_path: "/admin",
        entity_id: context.userId,
      } as never);
    } catch (e) {
      console.error("PIN reset staff alert failed:", e);
    }
    return { reset: true };
  });

/** Signed-in customer: email a fresh login code. */
export const requestMyPortalCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    setResponseHeader("cache-control", "no-store");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: ok } = await supabaseAdmin.rpc("manual_credentials_throttle", { p_key: `portal-self:${context.userId}`, p_limit: 5 });
    if (!ok) throw new Error("Too many requests. Please try again in an hour.");
    const { data: user } = await supabaseAdmin.auth.admin.getUserById(context.userId);
    const email = user.user?.email;
    if (!email) throw new Error("Your account has no email saved. Please contact support.");
    if (!user.user?.email_confirmed_at) throw new Error("Please verify your account email first.");
    const { issuePortalCode } = await import("@/lib/customer-portal-code.server");
    await issuePortalCode(supabaseAdmin, context.userId, email);
    return { sent: true };
  });

export const unlockMyPortalCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ loginCode: portalLoginCodeSchema }).strict().parse(input))
  .handler(async ({ data, context }) => {
    setResponseHeader("cache-control", "no-store");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { verifyPortalCode } = await import("@/lib/customer-portal-code.server");
    return { expiresAt: await verifyPortalCode(supabaseAdmin, context.userId, data.loginCode) };
  });

/** Forgot Account Login ticket owner: post a temporary 6-digit PIN into the ticket; it must be changed on first use. */
export const sendTicketTempPin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ ticketId: z.string().uuid() }).strict().parse(input))
  .handler(async ({ data, context }) => {
    setResponseHeader("cache-control", "no-store");
    const { data: t } = await context.supabase.from("tickets").select("id, user_id, status, ticket_categories(slug)").eq("id", data.ticketId).maybeSingle();
    const slug = (t as { ticket_categories?: { slug?: string } | null } | null)?.ticket_categories?.slug;
    if (!t || t.user_id !== context.userId || slug !== "account") throw new Error("Not allowed");
    if (t.status === "closed") throw new Error("This ticket is closed.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: ok } = await supabaseAdmin.rpc("manual_credentials_throttle", { p_key: `ticket-temp-pin:${context.userId}`, p_limit: 3 });
    if (!ok) throw new Error("Too many PIN requests. Please try again in an hour.");
    const { data: user } = await supabaseAdmin.auth.admin.getUserById(context.userId);
    const email = user.user?.email?.trim().toLowerCase();
    if (!email) throw new Error("Your account has no email saved. Please wait for our team.");
    const key = await hash(email);
    const pin = String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000));
    const salt = hex(crypto.getRandomValues(new Uint8Array(24)));
    const { error } = await supabaseAdmin.from("manual_credential_access").upsert(
      { email_key: key, pin_hash: await hashPin(pin, salt), pin_salt: salt, pin_attempts: 0, pin_locked_until: null, pin_must_change: true },
      { onConflict: "email_key" },
    );
    if (error) throw new Error("We couldn't make a new PIN. Please try again.");
    const reply = `🔑 **Login helper**\n\nHere's your temporary PIN: **${pin}**\n\n1. Open **Service Credentials** and enter this PIN.\n2. You'll then be asked to choose your own new 6-digit PIN — this temporary one stops working once you do.\n\n🔗 [Open Service Credentials](/portal/logins)\n\nLet me know how you get on using the buttons below.`;
    await supabaseAdmin.from("ticket_messages").insert([
      { ticket_id: data.ticketId, sender_id: context.userId, content: "I've lost my PIN", is_internal: false },
      { ticket_id: data.ticketId, sender_id: context.userId, content: reply, is_internal: false },
    ]);
    return { sent: true };
  });
