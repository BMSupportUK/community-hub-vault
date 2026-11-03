import { createFileRoute } from "@tanstack/react-router";
import { logDownload } from "@/lib/download-log.server";

/** Public Mac release download only; never serves Android updates or device data. */
export const Route = createFileRoute("/api/public/player-mac")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: row } = await supabaseAdmin.from("app_builds")
          .select("id, app_name, file_path, version_name, file_size")
          .eq("app_name", "BM Player for Mac")
          .eq("is_available", true).eq("is_current", true)
          .order("updated_at", { ascending: false }).limit(1).maybeSingle();
        if (!row?.file_path || !row.file_path.endsWith(".zip")) return new Response("Mac download unavailable", { status: 404 });
        if (new URL(request.url).searchParams.get("info") === "1") {
          return Response.json({ version: row.version_name, bytes: row.file_size }, { headers: { "cache-control": "no-store" } });
        }
        const { data: signed } = await supabaseAdmin.storage.from("app-builds").createSignedUrl(row.file_path, 600);
        if (!signed?.signedUrl) return new Response("Installer unavailable", { status: 502 });
        const range = request.headers.get("range");
        const upstream = await fetch(signed.signedUrl, { headers: range && /^bytes=\d*-\d*$/.test(range) ? { Range: range } : {} });
        if (!upstream.ok) return new Response("Installer unavailable", { status: 502 });
        const version = (row.version_name || "latest").replace(/[^\w.-]/g, "");
        const headers = new Headers({
          "content-type": "application/zip",
          "content-disposition": `attachment; filename="BM-Player-Mac-${version}.zip"`,
          "cache-control": "no-store",
        });
        for (const key of ["content-length", "content-range", "accept-ranges"]) {
          const value = upstream.headers.get(key);
          if (value) headers.set(key, value);
        }
        await logDownload(request, { source: "player_mac", buildId: row.id, appName: row.app_name, version: row.version_name, bytes: row.file_size });
        return new Response(upstream.body, { status: upstream.status, headers });
      },
    },
  },
});