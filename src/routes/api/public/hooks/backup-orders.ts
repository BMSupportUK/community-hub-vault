import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Daily order-history backup. Called by pg_cron. Dumps all orders + order_items
// into a JSON file in the private `order-backups` storage bucket.
// Auth: requires the Supabase anon key in the `apikey` header (sent by pg_cron).
export const Route = createFileRoute("/api/public/hooks/backup-orders")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey");
        if (!apikey || apikey !== process.env.SUPABASE_PUBLISHABLE_KEY) {
          return new Response("Unauthorized", { status: 401 });
        }

        try {
          // Pull everything. 1000-row default limit overridden via range.
          const { data: orders, error: oErr } = await supabaseAdmin
            .from("orders")
            .select("*")
            .order("created_at", { ascending: true })
            .range(0, 99999);
          if (oErr) throw oErr;

          const { data: items, error: iErr } = await supabaseAdmin
            .from("order_items")
            .select("*")
            .order("created_at", { ascending: true })
            .range(0, 999999);
          if (iErr) throw iErr;

          const payload = {
            generated_at: new Date().toISOString(),
            order_count: orders?.length ?? 0,
            item_count: items?.length ?? 0,
            orders: orders ?? [],
            order_items: items ?? [],
          };

          const now = new Date();
          const yyyy = now.getUTCFullYear();
          const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
          const dd = String(now.getUTCDate()).padStart(2, "0");
          const hh = String(now.getUTCHours()).padStart(2, "0");
          const mi = String(now.getUTCMinutes()).padStart(2, "0");
          const path = `${yyyy}/${mm}/orders-${yyyy}${mm}${dd}-${hh}${mi}.json`;

          const body = new Blob([JSON.stringify(payload, null, 2)], {
            type: "application/json",
          });

          const { error: upErr } = await supabaseAdmin.storage
            .from("order-backups")
            .upload(path, body, {
              contentType: "application/json",
              upsert: true,
            });
          if (upErr) throw upErr;

          // Retention: keep last 60 daily files. Trim anything older.
          const { data: existing } = await supabaseAdmin.storage
            .from("order-backups")
            .list("", { limit: 1000, sortBy: { column: "created_at", order: "desc" } });

          // The list above only returns top-level entries (year folders). Walk one level deep.
          const allFiles: { path: string; created_at: string }[] = [];
          for (const top of existing ?? []) {
            const { data: monthDirs } = await supabaseAdmin.storage
              .from("order-backups")
              .list(top.name, { limit: 1000 });
            for (const m of monthDirs ?? []) {
              const { data: files } = await supabaseAdmin.storage
                .from("order-backups")
                .list(`${top.name}/${m.name}`, { limit: 1000 });
              for (const f of files ?? []) {
                allFiles.push({
                  path: `${top.name}/${m.name}/${f.name}`,
                  created_at: f.created_at ?? "",
                });
              }
            }
          }
          allFiles.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
          const toDelete = allFiles.slice(60).map((f) => f.path);
          if (toDelete.length) {
            await supabaseAdmin.storage.from("order-backups").remove(toDelete);
          }

          return new Response(
            JSON.stringify({
              ok: true,
              path,
              order_count: payload.order_count,
              item_count: payload.item_count,
              pruned: toDelete.length,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error("backup-orders failed:", msg);
          return new Response(JSON.stringify({ ok: false, error: msg }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
