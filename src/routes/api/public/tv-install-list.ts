import { createFileRoute } from "@tanstack/react-router";

/**
 * Apps an admin ticked "Install on TV during setup". BM TV Enabler reads this
 * list for new-customer setups. Only public app names/versions are returned.
 */
export const Route = createFileRoute("/api/public/tv-install-list")({
  server: {
    handlers: {
      GET: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data } = await supabaseAdmin
          .from("app_builds")
          .select("id, app_name, file_name, version_name, sort_order")
          .eq("install_on_tv", true)
          .eq("is_available", true)
          .eq("is_current", true)
          .not("file_path", "is", null)
          .ilike("file_name", "%.apk")
          .order("sort_order", { ascending: true });
        const apps = (data ?? []).map((r) => ({
          id: r.id,
          name: r.app_name || r.file_name,
          version: r.version_name ?? null,
          path: `/api/public/tv-install-apk/${r.id}`,
        }));
        return Response.json({ apps }, { headers: { "cache-control": "no-store" } });
      },
    },
  },
});
