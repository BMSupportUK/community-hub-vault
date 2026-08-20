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
    const last = data?.value?.at ? Date.parse(String(data.value.at)) : NaN;
    if (Number.isFinite(last) && Date.now() - last < MIN_INTERVAL_MS) {
      return { ok: true, skipped: "throttled" };
    }
  }

  await admin
    .from("app_settings")
    .upsert({ key: SETTING_KEY, value: { at: new Date().toISOString() } }, { onConflict: "key" });

  const { syncFantasyPlayersFromClub } = await import("@/lib/fantasy-squad-sync.server");
  const squad = await syncFantasyPlayersFromClub(admin as never);

  // The official X account announces movement well before the website squad
  // list updates, so it runs last and has the final say on in/out and loans.
  let xTransfers: unknown = null;
  try {
    const { syncFantasyTransfersFromX } = await import("@/lib/mfc-x-transfers.server");
    xTransfers = await syncFantasyTransfersFromX(admin as never);
  } catch (e) {
    xTransfers = { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  // Injury/suspension flags from the official EFL Fantasy feed.
  let injuries: unknown = null;
  try {
    const { syncFantasyInjuriesFromEfl } = await import("@/lib/efl-fantasy-injuries.server");
    injuries = await syncFantasyInjuriesFromEfl(admin as never);
  } catch (e) {
    injuries = { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  return { ...squad, injuries, xTransfers };
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
