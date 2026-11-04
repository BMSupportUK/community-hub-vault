import type { UserAttributes } from "@supabase/supabase-js";

/** Auth SDK updateUser needs stored session state; server middleware only has a bearer. */
export async function updatePasswordAuthUser(
  url: string,
  publishableKey: string,
  authorization: string,
  attributes: UserAttributes,
  send: typeof fetch = fetch,
): Promise<{ error: { code?: string; message: string } | null }> {
  if (!authorization.startsWith("Bearer ") || !authorization.slice(7).trim()) {
    throw new Error("Your reset session has ended. Please request a new password-reset email.");
  }
  const response = await send(`${url.replace(/\/$/, "")}/auth/v1/user`, {
    method: "PUT",
    headers: { apikey: publishableKey, Authorization: authorization, "Content-Type": "application/json" },
    body: JSON.stringify(attributes),
  });
  if (response.ok) return { error: null };
  const body = await response.json() as { code?: string; error_code?: string; msg?: string; message?: string; error_description?: string };
  return { error: {
    code: body.error_code ?? body.code,
    message: body.msg ?? body.message ?? body.error_description ?? "Couldn't confirm your password. Please try again.",
  } };
}