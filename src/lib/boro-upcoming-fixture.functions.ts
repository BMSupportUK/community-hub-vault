import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type UpcomingFixtureDTO = {
  kickoff: string;
  competition: string;
  home: string;
  away: string;
  venue: string | null;
} | null;

/**
 * The next Boro fixture that has not kicked off yet, straight from our fixture
 * list. The match centre's weekly rollover rule deliberately keeps showing the
 * current week's game, so this powers the pop-up's "Next fixture" preview tab
 * (line-ups, form and stats) before the switch-over happens on Monday.
 */
export const getBoroUpcomingFixture = createServerFn({ method: "GET" }).handler(
  async (): Promise<UpcomingFixtureDTO> => {
    const key = process.env['SUPABASE_PUBLISHABLE_KEY']!;
    const supabase = createClient<Database>(process.env['SUPABASE_URL']!, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) => {
          const h = new Headers(init?.headers);
          if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
          h.set("apikey", key);
          return fetch(input, { ...init, headers: h });
        },
      },
    });

    const { data } = await supabase
      .from("boro_fixtures")
      .select("home_team, away_team, kickoff_at, competition, venue")
      .gt("kickoff_at", new Date().toISOString())
      .order("kickoff_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!data?.kickoff_at) return null;
    return {
      kickoff: data.kickoff_at,
      competition: data.competition ?? "",
      home: data.home_team,
      away: data.away_team,
      venue: (data as { venue?: string | null }).venue ?? null,
    };
  },
);
