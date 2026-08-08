import { createFileRoute } from "@tanstack/react-router";

const SETTING_KEY = "fantasy_squad_sync_last_run";
/** Don't hammer the club feed — one real sync per 2 minutes is plenty. */
const MIN_INTERVAL_MS = 2 * 60 * 1000;

async function run(force: boolean) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as never as { from: (t: string) => any };

  if (!force) {
    const { data } = await admin
      .from("app_settings")
      .select("value")
      .eq("key", SETTING_KEY)
      .maybeSingle();
    const last = data?.value ? Date.parse(String(data.value)) : NaN;
    if (Number.isFinite(last) && Date.now() - last < MIN_INTERVAL_MS) {
      return { ok: true, skipped: "throttled" };
    }
  }

  await admin
    .from("app_settings")
    .upsert({ key: SETTING_KEY, value: new Date().toISOString() }, { onConflict: "key" });

  const { syncFantasyPlayersFromClub } = await import("@/lib/fantasy-squad-sync.server");
  return await syncFantasyPlayersFromClub(admin as never);
}

export const Route = createFileRoute("/api/public/hooks/fantasy-squad-sync")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        Response.json(await run(new URL(request.url).searchParams.get("force") === "1")),
      POST: async ({ request }) =>
        Response.json(await run(new URL(request.url).searchParams.get("force") === "1")),
    },
  },
});
