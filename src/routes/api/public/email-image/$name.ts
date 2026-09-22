import { createFileRoute } from "@tanstack/react-router";

/**
 * Serves an admin-uploaded email image from the private `email-assets` store.
 * Email clients cannot sign in, so the file is streamed through this public
 * address; only staff can upload, and nothing else in the store is reachable.
 */
export const Route = createFileRoute("/api/public/email-image/$name")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const name = String(params.name ?? "");
        if (!/^[A-Za-z0-9._-]+$/.test(name)) {
          return new Response("Not found", { status: 404 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin.storage.from("email-assets").download(name);
        if (error || !data) return new Response("Not found", { status: 404 });

        return new Response(await data.arrayBuffer(), {
          headers: {
            "content-type": data.type || "application/octet-stream",
            "cache-control": "public, max-age=31536000, immutable",
          },
        });
      },
    },
  },
});
