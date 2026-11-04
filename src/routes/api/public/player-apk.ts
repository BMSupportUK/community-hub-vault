import { createFileRoute } from "@tanstack/react-router";
import { logDownload } from "@/lib/download-log.server";

/**
 * BM Player self-update. `?info=1` returns the latest published version; otherwise streams the APK.
 * Only serves the build an admin has marked available. No private data.
 */
export const Route = createFileRoute("/api/public/player-apk")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: row } = await supabaseAdmin
          .from("app_builds")
          .select("id, app_name, file_path, version_name, release_notes")
          .eq("package_name", "uk.bmsupport.player")
          .eq("is_available", true)
          .not("file_path", "is", null)
          // The build an admin marked current wins; a shared timestamp must never hand out an older APK.
          .order("is_current", { ascending: false })
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!row?.file_path) return new Response("BM Player not uploaded yet", { status: 404 });
        if (new URL(request.url).searchParams.get("info")) {
          return Response.json(
            { version: row.version_name ?? "", notes: row.release_notes ?? "" },
            { headers: { "cache-control": "no-store" } },
          );
        }
        const { data: signed } = await supabaseAdmin.storage.from("app-builds").createSignedUrl(row.file_path as string, 600);
        if (!signed?.signedUrl) return new Response("App file unavailable", { status: 502 });
        const upstream = await fetch(signed.signedUrl);
        if (!upstream.ok) return new Response("App file unavailable", { status: 502 });
        const headers = new Headers({
          "content-type": "application/vnd.android.package-archive",
          "content-disposition": `attachment; filename="BM-Player-${row.version_name ?? "latest"}.apk"`,
          "cache-control": "no-store",
        });
        const len = upstream.headers.get("content-length");
        if (len) headers.set("content-length", len);
        await logDownload(request, { source: "player_update", buildId: row.id, appName: row.app_name, version: row.version_name, bytes: Number(len) || null });
        return new Response(upstream.body, { status: 200, headers });
      },
    },
  },
});
