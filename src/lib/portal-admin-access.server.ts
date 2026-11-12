import { getCookie } from "@tanstack/react-start/server";
import { z } from "zod";
import { portalAdminPinBypass } from "./portal-admin-access";

/** The HttpOnly capability is issued only after admin authentication; never trust browser flags. */
export async function hasPortalAdminAccess(userId: string) {
  return (await portalAdminAccessExpiresAt(userId)) !== null;
}

export async function portalAdminAccessExpiresAt(userId: string): Promise<string | null> {
  const cookie = getCookie("bm-admin-customer-return");
  if (!cookie) return null;
  let token: string;
  try {
    token = z.object({ token: z.string().min(64) }).parse(JSON.parse(cookie)).token;
  } catch { return null; }
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  const tokenHash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: audit, error } = await supabaseAdmin.from("admin_customer_account_switches")
    .select("admin_id,customer_id,returned_at,expires_at")
    .eq("return_token_hash", tokenHash).eq("customer_id", userId)
    .is("returned_at", null).gt("expires_at", new Date().toISOString()).maybeSingle();
  if (error || !audit) return null;
  const { data: roles, error: roleError } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", audit.admin_id);
  return !roleError && portalAdminPinBypass(audit, userId, (roles ?? []).map((row) => row.role)) ? audit.expires_at : null;
}