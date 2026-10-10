import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normalizeEarlyFinishReason } from "@/lib/shift-finish";

async function notify(userIds: string[], title: string, body: string, link: string, sourceId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  if (userIds.length === 0) return;
  await supabaseAdmin.from("user_notifications").insert(
    userIds.map((user_id) => ({
      user_id,
      kind: "early_finish",
      title,
      body,
      link_path: link,
      source_type: "early_finish",
      source_id: sourceId,
    })) as never,
  );
  try {
    const { broadcastToUser } = await import("@/lib/push.functions");
    await Promise.all(
      userIds.map((u) => broadcastToUser(u, title, body, link, `early-finish-${sourceId}`, "early-finish")),
    );
  } catch {
    /* push is best-effort */
  }
}

/** Staff asks to finish their open shift early; admin + management are alerted. */
export const requestEarlyFinish = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { reason: string }) => {
    const reason = normalizeEarlyFinishReason(d?.reason);
    if (!reason) throw new Error("A reason is required so admin or management can see why.");
    return { reason };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: shift } = await supabase
      .from("shifts").select("id").eq("user_id", userId).is("clock_out", null).limit(1).maybeSingle();
    if (!shift) throw new Error("You're not on shift.");
    const { data: req, error } = await supabase
      .from("early_finish_requests")
      .insert({ shift_id: shift.id, user_id: userId, reason: data.reason })
      .select("id").single();
    if (error) {
      if (error.code === "23505") throw new Error("You already have an early finish request waiting.");
      throw new Error(error.message);
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: prof }, { data: managers }] = await Promise.all([
      supabaseAdmin.from("profiles").select("display_name, username").eq("id", userId).maybeSingle(),
      supabaseAdmin.from("user_roles").select("user_id").in("role", ["admin", "management"]),
    ]);
    const who = (prof as any)?.display_name || (prof as any)?.username || "A staff member";
    const ids = [...new Set(((managers ?? []) as { user_id: string }[]).map((m) => m.user_id))].filter((id) => id !== userId);
    await notify(ids, `${who} asked to finish early`, data.reason, "/admin-shifts", req.id);
    return { ok: true };
  });

/** Admin/management approves (ends the shift as an early finish) or declines. */
export const decideEarlyFinish = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; approve: boolean }) => ({ id: String(d.id), approve: Boolean(d.approve) }))
  .handler(async ({ data, context }) => {
    const { error, data: result } = await context.supabase.rpc("decide_early_finish", {
      _id: data.id,
      _approve: data.approve,
    });
    if (error) throw new Error(error.message);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: req } = await supabaseAdmin
      .from("early_finish_requests").select("user_id").eq("id", data.id).maybeSingle();
    if (req) {
      await notify(
        [(req as any).user_id],
        data.approve ? "Early finish approved" : "Early finish declined",
        data.approve ? "Your shift has been ended as an early finish." : "Please carry on with your shift.",
        "/clock",
        data.id,
      );
    }
    return { result };
  });
