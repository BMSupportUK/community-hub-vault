import { createFileRoute } from "@tanstack/react-router";

async function authorised(request: Request): Promise<boolean> {
  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return false;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.auth.getUser(token);
  const uid = data.user?.id;
  if (!uid) return false;
  const { data: roles } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", uid);
  return (roles ?? []).some((r: { role: string }) => r.role === "admin");
}

async function run(request: Request) {
  if (!(await authorised(request))) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  const topicId = url.searchParams.get("topic") ?? undefined;
  const clear = url.searchParams.get("clear") === "1";
  const mod = await import("@/lib/boro-match-demo.server");
  try {
    return Response.json(clear ? await mod.clearBoroDemoPosts(topicId) : await mod.postBoroDemoPosts(topicId));
  } catch (e) {
    console.error("boro-match-demo failed", e);
    return Response.json({ ok: false, error: "Failed" }, { status: 500 });
  }
}

export const Route = createFileRoute("/api/public/hooks/boro-match-demo")({
  server: {
    handlers: {
      GET: async ({ request }) => run(request),
      POST: async ({ request }) => run(request),
    },
  },
});
