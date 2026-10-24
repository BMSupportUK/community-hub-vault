import { createFileRoute } from "@tanstack/react-router";

/**
 * Serves the latest available "BM TV Enabler" phone APK (Install Guides → App APK).
 * Public on purpose: customers scan a QR code from Install Guides on their phone.
 * Only returns a build an admin has marked available; no private data.
 */
export const Route = createFileRoute("/api/public/tv-enabler-apk")({
  server: {
    handlers: {
      GET: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: row } = await supabaseAdmin
          .from("app_builds")
          .select("file_path, version_name")
          .ilike("app_name", "%tv enabler%")
          .eq("is_available", true)
          .not("file_path", "is", null)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!row?.file_path) return new Response("BM TV Enabler not uploaded yet", { status: 404 });
        const { data: signed } = await supabaseAdmin.storage.from("app-builds").createSignedUrl(row.file_path as string, 600);
        if (!signed?.signedUrl) return new Response("App file unavailable", { status: 502 });
        const upstream = await fetch(signed.signedUrl);
        if (!upstream.ok) return new Response("App file unavailable", { status: 502 });
        const headers = new Headers({
          "content-type": "application/vnd.android.package-archive",
          "content-disposition": `attachment; filename="BMTvEnabler-${row.version_name ?? "latest"}.apk"`,
          "cache-control": "no-store",
        });
        const len = upstream.headers.get("content-length");
        if (len) headers.set("content-length", len);
        return new Response(upstream.body, { status: 200, headers });
      },
    },
  },
});
