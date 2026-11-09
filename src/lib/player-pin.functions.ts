import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/** Whether the signed-in customer has a BM Player PIN. */
export const getMyPlayerPin = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { data } = await context.supabase.from("player_pins").select("updated_at").eq("owner_id", context.userId).maybeSingle();
  return { set: !!data, updatedAt: data?.updated_at ?? null };
});

/** Set or change the signed-in customer's own BM Player PIN. */
export const setMyPlayerPin = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ pin: z.string().regex(/^\d{4}$/) }))
  .handler(async ({ data, context }) => {
    const { weakPin, newSalt, hashPin } = await import("@/lib/player-pin");
    if (weakPin(data.pin)) return { ok: false as const, error: "That PIN is too easy to guess. Avoid 0000, 1234 and similar." };
    const salt = newSalt();
    const pin_hash = await hashPin(data.pin, salt);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("player_pins").upsert({ owner_id: context.userId, salt, pin_hash, updated_at: new Date().toISOString() }, { onConflict: "owner_id" });
    if (error) return { ok: false as const, error: "Couldn't save your PIN. Try again." };
    await supabaseAdmin.from("player_devices").update({ pin_failures: 0, pin_locked_until: null, pin_lock_level: 0 }).eq("user_id", context.userId);
    return { ok: true as const };
  });

async function requireAdminOrManagement(context: { supabase: any; userId: string }) {
  const [a, m] = await Promise.all([
    context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" }),
    context.supabase.rpc("has_role", { _user_id: context.userId, _role: "management" }),
  ]);
  if (!a.data && !m.data) throw new Error("Forbidden");
}

/** Admin/management: does this customer have a PIN? */
export const adminPlayerPinStatus = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ userId: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    await requireAdminOrManagement(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin.from("player_pins").select("updated_at").eq("owner_id", data.userId).maybeSingle();
    return { set: !!row };
  });

/** Admin/management: set a customer's PIN, or clear it (pin null) so their boxes stop asking. */
export const adminSetPlayerPin = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ userId: z.string().uuid(), pin: z.string().regex(/^\d{4}$/).nullable() }))
  .handler(async ({ data, context }) => {
    await requireAdminOrManagement(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.pin === null) {
      await supabaseAdmin.from("player_pins").delete().eq("owner_id", data.userId);
    } else {
      const { weakPin, newSalt, hashPin } = await import("@/lib/player-pin");
      if (weakPin(data.pin)) return { ok: false as const, error: "That PIN is too easy to guess." };
      const salt = newSalt();
      await supabaseAdmin.from("player_pins").upsert({ owner_id: data.userId, salt, pin_hash: await hashPin(data.pin, salt), updated_at: new Date().toISOString() }, { onConflict: "owner_id" });
    }
    await supabaseAdmin.from("player_devices").update({ pin_failures: 0, pin_locked_until: null, pin_lock_level: 0 }).eq("user_id", data.userId);
    return { ok: true as const };
  });
