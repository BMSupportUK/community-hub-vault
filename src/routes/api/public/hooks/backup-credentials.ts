import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Daily user-credentials backup. Called by pg_cron. Dumps all app credentials
// (with decrypted passwords/notes) into a JSON file in the private
// `credentials-backups` storage bucket. Bucket is admin/management read-only.
// Auth: requires the Supabase anon key in the `apikey` header (sent by pg_cron).
export const Route = createFileRoute("/api/public/hooks/backup-credentials")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey");
        if (!apikey || apikey !== process.env.SUPABASE_PUBLISHABLE_KEY) {
          return new Response("Unauthorized", { status: 401 });
        }

        try {
          const { data: creds, error } = await supabaseAdmin.rpc(
            "export_app_credentials_for_backup",
          );
          if (error) throw error;

          const payload = {
            generated_at: new Date().toISOString(),
            count: creds?.length ?? 0,
            credentials: creds ?? [],
          };

          const now = new Date();
          const yyyy = now.getUTCFullYear();
          const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
          const dd = String(now.getUTCDate()).padStart(2, "0");
          const hh = String(now.getUTCHours()).padStart(2, "0");
          const mi = String(now.getUTCMinutes()).padStart(2, "0");
          const path = `${yyyy}/${mm}/credentials-${yyyy}${mm}${dd}-${hh}${mi}.json`;

          const body = new Blob([JSON.stringify(payload, null, 2)], {
            type: "application/json",
          });

          const { error: upErr } = await supabaseAdmin.storage
            .from("credentials-backups")
            .upload(path, body, {
              contentType: "application/json",
              upsert: true,
            });
          if (upErr) throw upErr;

          // Retention: keep last 60 snapshots.
          const { data: topDirs } = await supabaseAdmin.storage
            .from("credentials-backups")
            .list("", { limit: 1000 });

          const allFiles: { path: string; created_at: string }[] = [];
          for (const top of topDirs ?? []) {
            const { data: monthDirs } = await supabaseAdmin.storage
              .from("credentials-backups")
              .list(top.name, { limit: 1000 });
            for (const m of monthDirs ?? []) {
              const { data: files } = await supabaseAdmin.storage
                .from("credentials-backups")
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
            await supabaseAdmin.storage
              .from("credentials-backups")
              .remove(toDelete);
          }

          return new Response(
            JSON.stringify({
              ok: true,
              path,
              count: payload.count,
              pruned: toDelete.length,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error("backup-credentials failed:", msg);
          return new Response(JSON.stringify({ ok: false, error: msg }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
