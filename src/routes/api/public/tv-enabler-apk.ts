import { createFileRoute } from "@tanstack/react-router";
import { logDownload } from "@/lib/download-log.server";

/**
 * Serves the latest available "BM TV Enabler" phone APK (Install Guides → App APK).
 * Public on purpose: customers scan a QR code from Install Guides on their phone.
 * Only returns a build an admin has marked available; no private data.
 */
export const Route = createFileRoute("/api/public/tv-enabler-apk")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        // Scanning the QR opens a page with one Download button. Serving the APK straight from the
        // scan let QR apps, link previews and the browser each start their own download.
        if (new URL(request.url).searchParams.get("download") !== "1") {
          return new Response(LANDING_HTML, {
            status: 200,
            headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
          });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: row } = await supabaseAdmin
          .from("app_builds")
          .select("id, app_name, file_path, version_name")
          .ilike("app_name", "%tv enabler%")
          .not("app_name", "ilike", "%windows%")
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
        await logDownload(request, { source: "enabler_phone", buildId: row.id, appName: row.app_name, version: row.version_name, bytes: Number(upstream.headers.get("content-length")) || null });
        const len = upstream.headers.get("content-length");
        if (len) headers.set("content-length", len);
        return new Response(upstream.body, { status: 200, headers });
      },
    },
  },
});

const LANDING_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>Download BM TV Enabler | BM Support</title>
<style>
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#121826;color:#f4f6fb;font-family:system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:420px;padding:28px;text-align:center}
h1{font-size:26px;margin:0 0 10px}p{color:#b8c0d4;line-height:1.5;margin:0 0 22px}
a.btn{display:block;background:#e23b4a;color:#fff;text-decoration:none;font-weight:700;font-size:20px;padding:18px;border-radius:12px}
small{display:block;margin-top:18px;color:#8b93a8;line-height:1.5}
</style></head><body><main>
<h1>BM TV Enabler</h1>
<p>Tap the button once to download the app to this phone, then open the file to install it.</p>
<a class="btn" href="/api/public/tv-enabler-apk?download=1" download="BMTvEnabler.apk">Download BM TV Enabler</a>
<small>If Android asks, allow your browser to install apps. Already have it? Installing again updates it.</small>
</main></body></html>`;
