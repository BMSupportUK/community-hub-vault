import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PAY_BY_BANK_PROVIDER_KEY } from "@/lib/gocardless";

async function assertManager(supabase: any, userId: string) {
  const { data } = await supabase.rpc("has_any_role", { _user_id: userId, _roles: ["admin", "management"] });
  if (!data) throw new Error("Forbidden");
}

export const getPayByBankSetup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertManager(context.supabase, context.userId);
    const { goCardlessEnv } = await import("@/lib/gocardless.server");
    const { data } = await context.supabase.from("app_settings").select("value").eq("key", PAY_BY_BANK_PROVIDER_KEY).maybeSingle();
    const saved = (data?.value as { provider?: string } | null)?.provider === "gocardless" ? "gocardless" : "stripe";
    return { saved, goCardlessEnv: goCardlessEnv(), webhookReady: !!process.env.GOCARDLESS_WEBHOOK_SECRET };
  });

export const setPayByBankProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ provider: z.enum(["stripe", "gocardless"]) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertManager(context.supabase, context.userId);
    const { goCardlessEnv } = await import("@/lib/gocardless.server");
    if (data.provider === "gocardless" && (!goCardlessEnv() || !process.env.GOCARDLESS_WEBHOOK_SECRET)) throw new Error("GoCardless keys aren't saved yet");
    const { error } = await context.supabase.from("app_settings").upsert({ key: PAY_BY_BANK_PROVIDER_KEY, value: { provider: data.provider }, updated_by: context.userId, updated_at: new Date().toISOString() });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
