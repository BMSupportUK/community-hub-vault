import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const OWNER_ID = "73c113ce-ce1b-43f0-af24-c2a36cf0d8e7";

async function assertStaffAdmin(supabase: any, userId: string) {
  const [a, m] = await Promise.all([
    supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
    supabase.rpc("has_role", { _user_id: userId, _role: "management" }),
  ]);
  if (!a.data && !m.data) throw new Error("Forbidden");
}

function sessionIdFromClaims(claims: any): string | null {
  return typeof claims?.session_id === "string" ? claims.session_id : null;
}

export const getRemoteSignOutInfo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ targetId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertStaffAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: info } = await (supabaseAdmin as any).rpc("admin_user_session_info", { _target: data.targetId });
    const row = Array.isArray(info) ? info[0] : info;
    const { data: last } = await supabaseAdmin
      .from("remote_signout_log")
      .select("created_at")
      .eq("target_id", data.targetId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return {
      sessionCount: Number(row?.session_count ?? 0),
      lastSignIn: (row?.last_sign_in as string | null) ?? null,
      lastRemoteSignOut: (last?.created_at as string | undefined) ?? null,
    };
  });

export const remoteSignOutUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ targetId: z.string().uuid(), keepThisDevice: z.boolean().default(false) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertStaffAdmin(context.supabase, context.userId);
    if (data.targetId === OWNER_ID && context.userId !== OWNER_ID) {
      throw new Error("Only the owner can sign out the owner account.");
    }
    const isSelf = data.targetId === context.userId;
    const keep = isSelf && data.keepThisDevice ? sessionIdFromClaims(context.claims) : null;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: n, error } = await (supabaseAdmin as any).rpc("admin_revoke_user_sessions", {
      _target: data.targetId,
      _keep_session: keep,
    });
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("remote_signout_log").insert({
      actor_id: context.userId,
      target_id: data.targetId,
      sessions_revoked: Number(n ?? 0),
    });
    try {
      const ch = supabaseAdmin.channel(`force-signout-${data.targetId}`);
      await (ch as any).httpSend("force-signout", { keepSessionId: keep });
      await supabaseAdmin.removeChannel(ch);
    } catch (e) {
      console.warn("[remote-signout] broadcast failed", e);
    }
    return { revoked: Number(n ?? 0) };
  });
