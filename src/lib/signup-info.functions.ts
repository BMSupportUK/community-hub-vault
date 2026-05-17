import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader, getRequestIP } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const recordSignupInfo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { client: Record<string, unknown> }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const ip =
      getRequestIP({ xForwardedFor: true }) ??
      getRequestHeader("cf-connecting-ip") ??
      getRequestHeader("x-real-ip") ??
      "unknown";
    const ua = getRequestHeader("user-agent") ?? null;
    const c = data.client ?? {};
    const s = (v: unknown) => (v == null ? null : String(v));

    const { error } = await supabase.from("signup_info").insert({
      user_id: userId,
      ip,
      user_agent: s(c.userAgent) ?? ua,
      language: s(c.language),
      languages: s(c.languages),
      timezone: s(c.timezone),
      screen: s(c.screen),
      viewport: s(c.viewport),
      platform: s(c.platform),
      referrer: s(c.referrer),
      url: s(c.url),
      vendor: s(c.vendor),
      device_memory: s(c.deviceMemory),
      hw_concurrency: s(c.hwConcurrency),
      connection: s(c.connection),
      extra: c,
    } as never);
    if (error) throw error;
    return { ok: true, ip };
  });