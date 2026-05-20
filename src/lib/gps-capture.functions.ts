import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const recordMyGpsLocation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
      accuracy: z.number().min(0).max(100000).optional().nullable(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.rpc("insert_my_location_event" as never, {
      _event_type: "gps",
      _ip: null,
      _country: null,
      _region: null,
      _city: null,
      _latitude: data.latitude,
      _longitude: data.longitude,
      _isp: null,
      _is_vpn: null,
      _is_proxy: null,
      _vpn_provider: null,
      _user_agent: getRequestHeader("user-agent") ?? null,
      _accuracy_m: data.accuracy ?? null,
    } as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
