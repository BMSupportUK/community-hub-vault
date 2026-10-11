import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normalizeCoverReason, normalizeCoverUntil, coverUntilIsValid } from "@/lib/cover-request";
import { ukClock } from "@/lib/shift-finish";

async function notify(userIds: string[], title: string, body: string, link: string, sourceId: string) {
  if (userIds.length === 0) return;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("user_notifications").insert(
    userIds.map((user_id) => ({
      user_id, kind: "cover_request", title, body, link_path: link,
      source_type: "cover_request", source_id: sourceId,
    })) as never,
  );
  try {
    const { broadcastToUser } = await import("@/lib/push.functions");
    await Promise.all(userIds.map((u) => broadcastToUser(u, title, body, link, `cover-${sourceId}`, "early-finish")));
  } catch { /* best-effort */ }
}

/** Staff not on the rota asks to sign in to cover; admin + management are alerted. */
export const requestCoverSignIn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { reason: string; until: string }) => {
    const reason = normalizeCoverReason(d?.reason);
    if (!reason) throw new Error("A reason for covering is required.");
    const until = normalizeCoverUntil(d?.until);
    if (!until) throw new Error("Enter the cover end time as HH:MM.");
    return { reason, until };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!coverUntilIsValid(data.until, ukClock(Date.now()).time)) {
      throw new Error("The cover end time must be later today (UK time).");
    }
    const { data: open } = await supabase.from("shifts").select("id").eq("user_id", userId).is("clock_out", null).limit(1).maybeSingle();
    if (open) throw new Error("You're already signed in.");
    const { data: req, error } = await supabase.from("cover_requests")
      .insert({ user_id: userId, reason: data.reason, cover_until: data.until }).select("id").single();
    if (error) {
      if (error.code === "23505") throw new Error("You already have a cover request waiting.");
      throw new Error(error.message);
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: prof }, { data: managers }] = await Promise.all([
      supabaseAdmin.from("profiles").select("display_name, username").eq("id", userId).maybeSingle(),
      supabaseAdmin.from("user_roles").select("user_id").in("role", ["admin", "management"]),
    ]);
    const who = (prof as any)?.display_name || (prof as any)?.username || "A staff member";
    const ids = [...new Set(((managers ?? []) as { user_id: string }[]).map((m) => m.user_id))].filter((id) => id !== userId);
    await notify(ids, `${who} asked to sign in to cover until ${data.until.slice(0, 5)}`, data.reason, "/admin-shifts", req.id);
    return { ok: true };
  });

/** Admin/management approves (adds the rota slot + signs them in) or declines. */
export const decideCoverRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; approve: boolean }) => ({ id: String(d.id), approve: Boolean(d.approve) }))
  .handler(async ({ data, context }) => {
    const { error, data: result } = await context.supabase.rpc("decide_cover_request", { _id: data.id, _approve: data.approve });
    if (error) throw new Error(error.message);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: req } = await supabaseAdmin.from("cover_requests").select("user_id, cover_until").eq("id", data.id).maybeSingle();
    if (req) {
      await notify([(req as any).user_id],
        data.approve ? "Cover approved — you're signed in" : "Cover request declined",
        data.approve ? `Added to the rota until ${String((req as any).cover_until).slice(0, 5)} UK.` : "You haven't been signed in.",
        "/clock", data.id);
    }
    return { result };
  });
