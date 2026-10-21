import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { getRequestHeader } from "@tanstack/react-start/server";
import { sendTemplateEmail } from "@/lib/email-templates/send-email";

async function hash(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, "0")).join("");
}

export async function issuePortalCode(admin: SupabaseClient<Database>, userId: string, email: string) {
  // Rejection sampling keeps all eight-digit codes equally likely.
  let value = crypto.getRandomValues(new Uint32Array(1))[0];
  while (value >= 4_200_000_000) value = crypto.getRandomValues(new Uint32Array(1))[0];
  const loginCode = (value % 100_000_000).toString().padStart(8, "0");
  const [{ error: portalError }, { error }] = await Promise.all([
    admin.rpc("portal_ensure_code", { p_user_id: userId }),
    admin.rpc("portal_issue_login_code", { p_user_id: userId, p_code_hash: await hash(`${userId}:${loginCode}`) }),
  ]);
  if (error || portalError) throw new Error("We couldn't send your code. Please try again.");
  const { data: profile } = await admin.from("profiles").select("display_name").eq("id", userId).maybeSingle();
  const result = await sendTemplateEmail("customer-portal-link", email, {
    templateData: { name: profile?.display_name ?? undefined, loginCode },
    idempotencyKey: `portal-code-${crypto.randomUUID()}`,
  });
  if (!result.sent) throw new Error("Your login email could not be sent. Please contact support.");
}

export async function verifyPortalCode(admin: SupabaseClient<Database>, userId: string | null, loginCode: string) {
  const ip = getRequestHeader("cf-connecting-ip") || "shared-preview";
  const { data: allowed, error: throttleError } = await admin.rpc("manual_credentials_throttle", { p_key: `portal-verify-ip:${await hash(ip)}`, p_limit: 30 });
  if (throttleError || !allowed) throw new Error("Too many attempts. Please try again in an hour.");
  if (!userId) throw new Error("Invalid or expired code. Request a new code.");
  const { data: expiresAt, error } = await admin.rpc("portal_verify_login_code", { p_user_id: userId, p_code_hash: await hash(`${userId}:${loginCode}`) });
  if (error || !expiresAt) throw new Error("Invalid or expired code. After five wrong attempts, request a new code.");
  return expiresAt;
}