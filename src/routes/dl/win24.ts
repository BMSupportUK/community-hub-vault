import { createFileRoute } from "@tanstack/react-router";
import { logDownload } from "@/lib/download-log.server";

/**
 * Short 24-hour test link for the current BM Player Windows build, made for passing to a
 * tester. After the expiry below it stops working and a fresh link must be requested.
 */
const EXPIRES_AT = Date.parse("2026-11-13T15:35:00Z");

const expired = () => new Response(
  "<!doctype html><meta name=viewport content='width=device-width'><body style='font-family:sans-serif;background:#121826;color:#f4f6fb;text-align:center;padding:60px'><h1>Link expired</h1><p>This 24-hour test link has run out. Ask BM Support for a new one.</p>",
  { status: 410, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } },
);

export const Route = createFileRoute("/dl/win24")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (Date.now() > EXPIRES_AT) return expired();
        const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
        const { data: row } = await db.from("app_builds").select("id, app_name, file_path, version_name")
          .eq("app_name", "BM Player for Windows").eq("is_current", true).not("file_path", "is", null)
          .order("created_at", { ascending: false }).limit(1).maybeSingle();
        if (!row?.file_path) return new Response("Windows player isn't available yet", { status: 404 });
        const { data: signed } = await db.storage.from("app-builds").createSignedUrl(row.file_path, 300);
        if (!signed?.signedUrl) return new Response("App file unavailable", { status: 502 });
        await logDownload(request, { source: "player_windows", buildId: row.id, appName: row.app_name, version: row.version_name });
        return new Response(null, { status: 302, headers: { location: signed.signedUrl, "cache-control": "no-store" } });
      },
    },
  },
});
