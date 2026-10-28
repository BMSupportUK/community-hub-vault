import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { HANDOFF_TTL_MS, makeHandoffCode, sha256Hex } from "@/lib/enabler-handoff";

/** Customer answers the Enabler questions on the website; returns a 6-digit code to type into BM TV Enabler. */
export const createEnablerHandoff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    device: z.enum(["amazon", "android"]),
    helpPlan: z.union([z.literal(1), z.literal(2)]),
    appPaths: z.array(z.string().regex(/^\/api\/public\/tv-install-apk\/[0-9a-f-]{36}$/)).max(40),
    ticketId: z.string().uuid().nullable(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    if (data.helpPlan === 1) {
      if (!data.ticketId) throw new Error("Open a help ticket first.");
      const { data: t } = await context.supabase.from("tickets").select("id, user_id").eq("id", data.ticketId).maybeSingle();
      if (!t || t.user_id !== context.userId) throw new Error("That ticket isn't yours.");
    } else if (data.appPaths.length === 0) throw new Error("Tick at least one app to install.");
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    // Replace any unused earlier code so only the latest answers count.
    await db.from("enabler_handoffs").update({ used_at: new Date().toISOString() }).eq("user_id", context.userId).is("used_at", null);
    for (let i = 0; i < 5; i++) {
      const code = makeHandoffCode();
      const expiresAt = new Date(Date.now() + HANDOFF_TTL_MS).toISOString();
      const { error } = await db.from("enabler_handoffs").insert({
        user_id: context.userId, code_hash: await sha256Hex(code), device: data.device, help_plan: data.helpPlan,
        app_paths: data.helpPlan === 1 ? [] : data.appPaths, ticket_id: data.helpPlan === 1 ? data.ticketId : null, expires_at: expiresAt,
      });
      if (!error) return { code, expiresAt };
    }
    throw new Error("Couldn't make a code. Try again.");
  });
