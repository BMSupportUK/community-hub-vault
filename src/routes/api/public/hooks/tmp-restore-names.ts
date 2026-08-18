import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/api/public/hooks/tmp-restore-names")({
  server: {
    handlers: {
      POST: async () => {
        const path = "2026/08/credentials-20260818-0330.json";
        const { data: file, error } = await supabaseAdmin.storage
          .from("credentials-backups")
          .download(path);
        if (error || !file) {
          return new Response(JSON.stringify({ error: error?.message ?? "missing" }), { status: 500 });
        }
        const snap = JSON.parse(await file.text()) as {
          credentials: Array<{ id: string; app_login_name: string | null }>;
        };
        const rows = (snap.credentials ?? []).map((c) => ({ id: c.id, name: c.app_login_name }));
        const { error: rpcErr } = await supabaseAdmin.rpc("exec_restore_names" as never, {} as never);
        return new Response(JSON.stringify({ count: rows.length, rows, rpcErr: rpcErr?.message ?? null }), {
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
