import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const KINDS = ["install_guides_access_request", "app_download_access_request"] as const;

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId);
  if (error) throw new Error(error.message);
  const roles = (data ?? []).map((r: { role: string }) => String(r.role));
  if (!roles.some((r) => r === "admin" || r === "management")) {
    throw new Error("Forbidden: admin or management only");
  }
}

export type GuideAccessRequest = {
  id: string;
  userId: string;
  section: "guides" | "download";
  member: string;
  requestedAt: string;
  alreadyHasAccess: boolean;
};

/** Pending guide / download access requests raised by members. */
export const listGuideAccessRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<GuideAccessRequest[]> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: notes, error } = await supabaseAdmin
      .from("staff_notifications")
      .select("id, kind, entity_id, created_at")
      .in("kind", KINDS as unknown as string[])
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);

    const rows = (notes ?? []).filter((n) => !!n.entity_id);
    const ids = [...new Set(rows.map((n) => n.entity_id as string))];
    if (!ids.length) return [];

    const [{ data: profiles }, { data: roles }] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, display_name, username").in("id", ids),
      supabaseAdmin.from("user_roles").select("user_id, role").in("user_id", ids),
    ]);

    const nameOf = new Map(
      (profiles ?? []).map((p) => [p.id, p.display_name || p.username || "Member"]),
    );
    const accessRoles = new Set(["subscriber", "admin", "management", "staff"]);
    const hasAccess = new Set(
      (roles ?? [])
        .filter((r) => accessRoles.has(String(r.role)))
        .map((r) => r.user_id as string),
    );

    // One row per member per section — keep the newest request.
    const seen = new Set<string>();
    const out: GuideAccessRequest[] = [];
    for (const n of rows) {
      const section = n.kind === "install_guides_access_request" ? "guides" : "download";
      const key = `${n.entity_id}:${section}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        id: n.id as string,
        userId: n.entity_id as string,
        section,
        member: nameOf.get(n.entity_id as string) ?? "Member",
        requestedAt: n.created_at as string,
        alreadyHasAccess: hasAccess.has(n.entity_id as string),
      });
    }
    return out;
  });

/** Grants access by giving the member the subscriber role and clearing the request. */
export const approveGuideAccessRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({ userId: z.string().uuid(), section: z.enum(["guides", "download"]) })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: data.userId, role: "subscriber" }, { onConflict: "user_id,role" });
    if (roleError) throw new Error(roleError.message);

    const kind =
      data.section === "guides" ? "install_guides_access_request" : "app_download_access_request";
    await supabaseAdmin
      .from("staff_notifications")
      .delete()
      .eq("kind", kind)
      .eq("entity_id", data.userId);

    await supabaseAdmin.from("user_notifications").insert({
      user_id: data.userId,
      kind: "guide_access_granted",
      title: data.section === "guides" ? "Install guides unlocked" : "App downloads unlocked",
      body:
        data.section === "guides"
          ? "Your access to the install guides has been approved."
          : "Your access to the BM App Store downloads has been approved.",
      link_path:
        data.section === "guides" ? "/install-guides?tab=guides" : "/install-guides?tab=get-app",
    });

    return { ok: true as const };
  });

/** Declines a request without granting access. */
export const declineGuideAccessRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({ userId: z.string().uuid(), section: z.enum(["guides", "download"]) })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const kind =
      data.section === "guides" ? "install_guides_access_request" : "app_download_access_request";
    const { error } = await supabaseAdmin
      .from("staff_notifications")
      .delete()
      .eq("kind", kind)
      .eq("entity_id", data.userId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
