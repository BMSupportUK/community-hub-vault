import { createFileRoute } from "@tanstack/react-router";
import { directLinkUsable, normalizeDirectCode } from "@/lib/direct-install";
import { sha256Hex } from "@/lib/enabler-handoff";
import { logDownload } from "@/lib/download-log.server";

/**
 * BM Direct Install download for Downloader on the TV. Only a valid, unexpired per-customer
 * link (made on Install Guides) streams the private APK; nothing else is ever exposed.
 */
const expired = () => new Response(
  "<!doctype html><meta name=viewport content='width=device-width'><body style='font-family:sans-serif;background:#121826;color:#f4f6fb;text-align:center;padding:60px'><h1>Link expired</h1><p>Request a new one on the website: bmsupport.uk &rsaquo; Install Guides &rsaquo; BM Direct Install.</p>",
  { status: 410, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } },
);

export const Route = createFileRoute("/di/$code")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const code = normalizeDirectCode(params.code);
        if (!code) return expired();
        const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
        const { data: link } = await db.from("direct_install_links").select("id, user_id, expires_at, used_count")
          .eq("code_hash", await sha256Hex(code)).maybeSingle();
        if (!link || !directLinkUsable(link, Date.now())) return expired();
        const { data: row } = await db.from("app_builds").select("id, app_name, file_path, version_name")
          .eq("app_name", "BM Direct Install").eq("is_available", true).not("file_path", "is", null)
          .order("created_at", { ascending: false }).limit(1).maybeSingle();
        if (!row?.file_path) return new Response("BM Direct Install isn't available yet", { status: 404 });
        const { data: signed } = await db.storage.from("app-builds").createSignedUrl(row.file_path, 60);
        if (!signed?.signedUrl) return new Response("App file unavailable", { status: 502 });
        const upstream = await fetch(signed.signedUrl);
        if (!upstream.ok) return new Response("App file unavailable", { status: 502 });
        await db.from("direct_install_links").update({ used_count: link.used_count + 1, downloaded_at: new Date().toISOString() }).eq("id", link.id);
        await logDownload(request, { source: "direct_install", buildId: row.id, appName: row.app_name, version: row.version_name, userId: link.user_id, bytes: Number(upstream.headers.get("content-length")) || null });
        const headers = new Headers({
          "content-type": "application/vnd.android.package-archive",
          "content-disposition": `attachment; filename="BM-Direct-Install-${row.version_name ?? "latest"}.apk"`,
          "cache-control": "no-store",
        });
        const len = upstream.headers.get("content-length");
        if (len) headers.set("content-length", len);
        return new Response(upstream.body, { status: 200, headers });
      },
    },
  },
});
