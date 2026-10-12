import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Only live temporary (demo) accounts may flip between subscriber and staff views. */
async function assertDemo(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await (supabaseAdmin as any)
    .from("temporary_accounts").select("expires_at").eq("user_id", userId).maybeSingle();
  if (!data || new Date(data.expires_at).getTime() < Date.now()) {
    throw new Error("Only the demo account can switch views.");
  }
  return supabaseAdmin;
}

export const isDemoAccount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    try { await assertDemo(context.userId); return { demo: true }; } catch { return { demo: false }; }
  });

export const switchDemoRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { to: "subscriber" | "staff" }) => {
    if (d?.to !== "subscriber" && d?.to !== "staff") throw new Error("Invalid view.");
    return { to: d.to };
  })
  .handler(async ({ data, context }) => {
    const admin = await assertDemo(context.userId);
    const from = data.to === "staff" ? "subscriber" : "staff";
    await admin.from("user_roles").delete().eq("user_id", context.userId).eq("role", from as never);
    const { error } = await admin.from("user_roles")
      .upsert({ user_id: context.userId, role: data.to } as never, { onConflict: "user_id,role" });
    if (error) throw new Error(error.message);
    return { role: data.to };
  });
