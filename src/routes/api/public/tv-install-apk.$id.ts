import { createFileRoute } from "@tanstack/react-router";

/** Streams one APK, only when an admin ticked it for TV setup and it's available. */
export const Route = createFileRoute("/api/public/tv-install-apk/$id")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        if (!/^[0-9a-f-]{36}$/i.test(params.id)) return new Response("Not found", { status: 404 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: row } = await supabaseAdmin
          .from("app_builds")
          .select("file_path, file_name")
          .eq("id", params.id)
          .eq("install_on_tv", true)
          .eq("is_available", true)
          .eq("is_current", true)
          .maybeSingle();
        if (!row?.file_path || !/\.apk$/i.test(row.file_name ?? "")) return new Response("Not found", { status: 404 });
        const { data: signed } = await supabaseAdmin.storage.from("app-builds").createSignedUrl(row.file_path, 600);
        if (!signed?.signedUrl) return new Response("App file unavailable", { status: 502 });
        const upstream = await fetch(signed.signedUrl);
        if (!upstream.ok) return new Response("App file unavailable", { status: 502 });
        const headers = new Headers({
          "content-type": "application/vnd.android.package-archive",
          "content-disposition": `attachment; filename="${(row.file_name ?? "app.apk").replace(/[^\w.\- ]/g, "")}"`,
          "cache-control": "no-store",
        });
        const len = upstream.headers.get("content-length");
        if (len) headers.set("content-length", len);
        return new Response(upstream.body, { status: 200, headers });
      },
    },
  },
});
