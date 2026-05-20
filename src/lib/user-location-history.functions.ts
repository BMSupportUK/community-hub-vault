import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface LocationHistoryRow {
  id: string;
  user_id: string;
  event_type: "signup" | "login";
  ip: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  isp: string | null;
  is_vpn: boolean | null;
  is_proxy: boolean | null;
  vpn_provider: string | null;
  user_agent: string | null;
  accuracy_m: number | null;
  created_at: string;
}

export const getUserLocationHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      userId: z.string().uuid(),
      limit: z.number().int().min(1).max(500).optional().default(50),
    }).parse(input),
  )
  .handler(async ({ data, context }): Promise<{ rows: LocationHistoryRow[] }> => {
    const { supabase } = context;
    const { data: rows, error } = await supabase.rpc(
      "admin_get_user_location_history" as never,
      { _user_id: data.userId, _limit: data.limit } as never,
    );
    if (error) throw new Error(error.message);
    return { rows: (rows ?? []) as LocationHistoryRow[] };
  });
