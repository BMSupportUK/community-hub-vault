import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { refreshAllStreamingPrices } from "./streaming-prices.server";

async function assertAdmin(supabase: any, userId: string) {
  const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const allowed = (roles ?? []).some((r: { role: string }) =>
    ["admin", "management"].includes(r.role),
  );
  if (!allowed) throw new Error("Forbidden");
}

const DeviceInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(120),
  brand: z.string().max(80).nullable().optional(),
  tier: z.enum(["high", "medium", "low"]),
  image_url: z.string().url().max(2048).nullable().optional(),
  summary: z.string().max(2000).nullable().optional(),
  specs: z.record(z.string(), z.string().max(200)).default({}),
  sideload_notes: z.string().max(1000).nullable().optional(),
  amazon_url: z.string().url().max(2048),
  sort_order: z.number().int().min(0).max(100000).default(100),
  is_active: z.boolean().default(true),
});

export const upsertStreamingDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => DeviceInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const row = {
      name: data.name,
      brand: data.brand ?? null,
      tier: data.tier,
      image_url: data.image_url ?? null,
      summary: data.summary ?? null,
      specs: data.specs ?? {},
      sideload_notes: data.sideload_notes ?? null,
      amazon_url: data.amazon_url,
      sort_order: data.sort_order,
      is_active: data.is_active,
    };
    if (data.id) {
      const { error } = await context.supabase
        .from("streaming_devices")
        .update(row)
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { ok: true, id: data.id };
    }
    const { data: inserted, error } = await context.supabase
      .from("streaming_devices")
      .insert(row)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, id: inserted.id as string };
  });

export const deleteStreamingDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("streaming_devices")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const refreshStreamingPrices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    return refreshAllStreamingPrices();
  });