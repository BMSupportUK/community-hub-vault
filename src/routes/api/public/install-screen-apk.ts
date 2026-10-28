import { createFileRoute } from "@tanstack/react-router";
import { logDownload } from "@/lib/download-log.server";

/**
 * Serves the latest available BM Install Screen APK — the tiny TV app BM TV Enabler installs first
 * during "Install our apps" to show install progress on the TV. Not a customer download card.
 */
export const Route = createFileRoute("/api/public/install-screen-apk")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: row } = await supabaseAdmin
          .from("app_builds")
          .select("id, app_name, file_path, version_name")
          .ilike("app_name", "bm install screen%")
          .eq("is_available", true)
          .not("file_path", "is", null)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!row?.file_path) return new Response("Install screen not uploaded yet", { status: 404 });
        const { data: signed } = await supabaseAdmin.storage.from("app-builds").createSignedUrl(row.file_path as string, 600);
        if (!signed?.signedUrl) return new Response("App file unavailable", { status: 502 });
        const upstream = await fetch(signed.signedUrl);
        if (!upstream.ok) return new Response("App file unavailable", { status: 502 });
        const headers = new Headers({
          "content-type": "application/vnd.android.package-archive",
          "content-disposition": `attachment; filename="BMInstallScreen-${row.version_name ?? "latest"}.apk"`,
          "cache-control": "no-store",
        });
        await logDownload(request, { source: "tv_install", buildId: row.id, appName: row.app_name, version: row.version_name, bytes: Number(upstream.headers.get("content-length")) || null });
        const len = upstream.headers.get("content-length");
        if (len) headers.set("content-length", len);
        return new Response(upstream.body, { status: 200, headers });
      },
    },
  },
});
