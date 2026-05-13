import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader, getRequestIP } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const logMyIp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const ip =
      getRequestIP({ xForwardedFor: true }) ??
      getRequestHeader("cf-connecting-ip") ??
      getRequestHeader("x-real-ip") ??
      "unknown";
    const userAgent = getRequestHeader("user-agent") ?? null;

    const { error } = await supabase.from("user_ip_logs").insert({
      user_id: userId,
      ip,
      user_agent: userAgent,
    });
    if (error) throw error;
    return { ok: true, ip };
  });