import { createServerFn } from "@tanstack/react-start";
import { getCookie, setCookie, deleteCookie, getRequestUrl, setResponseHeader } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { canSwitchCustomerAccount, isSwitchableCustomer } from "@/lib/customer-account-access";

const COOKIE = "bm-admin-customer-return";
const hash = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))), (b) => b.toString(16).padStart(2, "0")).join("");

export const startCustomerAccountSwitch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ customerId: z.string().uuid(), refreshToken: z.string().min(10), accessToken: z.string().min(10) }).strict().parse(input))
  .handler(async ({ data, context }) => {
    setResponseHeader("cache-control", "no-store");
    if (getCookie(COOKIE)) throw new Error("Return to your admin account before switching again.");
    const { data: roles, error: roleError } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
    if (roleError || !canSwitchCustomerAccount((roles ?? []).map((r) => r.role))) throw new Error("Only admin can log in as a customer.");
    const { data: identity, error: identityError } = await context.supabase.auth.getUser(data.accessToken);
    if (identityError || identity.user?.id !== context.userId) throw new Error("Your admin session could not be verified.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: targetRoles, error: targetError } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", data.customerId);
    const { data: temporary } = await supabaseAdmin.from("temporary_accounts").select("user_id").in("user_id", [data.customerId, context.userId]);
    if (targetError || temporary?.length || !isSwitchableCustomer((targetRoles ?? []).map((r) => r.role))) throw new Error("Choose an active customer site account, not a staff or demo account.");
    const { data: target, error: userError } = await supabaseAdmin.auth.admin.getUserById(data.customerId);
    if (userError || !target.user?.email || !target.user.email_confirmed_at) throw new Error("This customer must confirm their site account first.");
    const { data: link, error: linkError } = await supabaseAdmin.auth.admin.generateLink({ type: "magiclink", email: target.user.email });
    if (linkError || !link.properties?.hashed_token || link.user?.id !== data.customerId) throw new Error("Unable to open the customer account.");
    const returnToken = crypto.randomUUID() + crypto.randomUUID();
    const { error: auditError } = await supabaseAdmin.from("admin_customer_account_switches").insert({ admin_id: context.userId, customer_id: data.customerId, return_token_hash: await hash(returnToken) });
    if (auditError) throw new Error("Unable to record the account switch.");
    setCookie(COOKIE, JSON.stringify({ token: returnToken, refreshToken: data.refreshToken }), { httpOnly: true, secure: getRequestUrl().protocol === "https:", sameSite: "strict", path: "/", maxAge: 3600 });
    return { tokenHash: link.properties.hashed_token };
  });

export const customerAccountSwitchStatus = createServerFn({ method: "GET" })
  .handler(async () => {
    setResponseHeader("cache-control", "no-store");
    const cookie = getCookie(COOKIE);
    if (!cookie) return { active: false };
    try {
      const { token } = JSON.parse(cookie);
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data } = await supabaseAdmin.from("admin_customer_account_switches").select("id").eq("return_token_hash", await hash(token)).is("returned_at", null).gt("expires_at", new Date().toISOString()).maybeSingle();
      return { active: !!data };
    } catch { return { active: false }; }
  });

export const returnToAdminAccount = createServerFn({ method: "POST" })
  .handler(async () => {
    setResponseHeader("cache-control", "no-store");
    const cookie = getCookie(COOKIE);
    if (!cookie) throw new Error("Your return session expired. Please sign in as admin again.");
    const { token, refreshToken } = z.object({ token: z.string(), refreshToken: z.string() }).parse(JSON.parse(cookie));
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: audit } = await supabaseAdmin.from("admin_customer_account_switches").select("id,admin_id").eq("return_token_hash", await hash(token)).is("returned_at", null).gt("expires_at", new Date().toISOString()).maybeSingle();
    if (!audit) { deleteCookie(COOKIE, { path: "/" }); throw new Error("Your return session expired. Please sign in as admin again."); }
    const { createClient } = await import("@supabase/supabase-js");
    const client = createClient(process.env["SUPABASE_URL"]!, process.env["SUPABASE_PUBLISHABLE_KEY"]!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await client.auth.refreshSession({ refresh_token: refreshToken });
    if (error || !data.session || data.user?.id !== audit.admin_id) throw new Error("Please sign in as admin again; the saved session is no longer valid.");
    const { data: roles, error: roleError } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", data.user.id);
    if (roleError || !canSwitchCustomerAccount((roles ?? []).map((r) => r.role))) throw new Error("This account no longer has admin access.");
    const { error: auditError } = await supabaseAdmin.from("admin_customer_account_switches").update({ returned_at: new Date().toISOString() }).eq("id", audit.id).is("returned_at", null);
    if (auditError) throw new Error("Unable to complete the account switch.");
    deleteCookie(COOKIE, { path: "/" });
    return { access_token: data.session.access_token, refresh_token: data.session.refresh_token };
  });