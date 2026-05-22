import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const getPublicRatingSummary = createServerFn({ method: "GET" }).handler(
  async () => {
    const { data, error } = await supabaseAdmin
      .from("customer_reviews")
      .select("rating")
      .eq("status", "approved");
    if (error) throw new Error(error.message);
    const ratings = (data ?? []).map((r) => r.rating as number);
    const count = ratings.length;
    const average = count ? ratings.reduce((s, r) => s + r, 0) / count : 0;
    return { count, average };
  },
);