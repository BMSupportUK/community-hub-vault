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
          .select("id, app_name, file_name, file_path, package_name, version_name, sort_order")
          .eq("install_on_tv", true)
          .eq("is_available", true)
          .eq("is_current", true)
          .not("file_path", "is", null)
          .ilike("file_name", "%.apk")
          .order("sort_order", { ascending: true });
        const { validAndroidPackage } = await import("@/lib/apk-package");
        for (const row of data ?? []) {
          if (!validAndroidPackage(row.package_name) && row.file_path) {
            const { storedApkPackage } = await import("@/lib/apk-package.server");
            row.package_name = await storedApkPackage(row.file_path, row.file_name);
            if (row.package_name) await supabaseAdmin.from("app_builds").update({ package_name: row.package_name }).eq("id", row.id);
          }
        }
        const apps = (data ?? []).map((r) => ({
          id: r.id,
          name: r.app_name || r.file_name,
          version: r.version_name ?? null,
          packageName: r.package_name,
          path: `/api/public/tv-install-apk/${r.id}`,
        }));
        return Response.json({ apps }, { headers: { "cache-control": "no-store" } });
      },
    },
  },
});
