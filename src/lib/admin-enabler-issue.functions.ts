import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ADMIN_ISSUE_TTL_MS, makeHandoffCode, sha256Hex } from "@/lib/enabler-handoff";
import { makePin, pinHash } from "@/lib/enabler-pin";
import { encryptPin } from "@/lib/enabler-pin-crypto.server";

async function requireAdminOrManagement(sb: { rpc: (fn: "has_role", a: { _user_id: string; _role: "admin" | "management" }) => PromiseLike<{ data: boolean | null }> }, userId: string) {
  const [a, m] = await Promise.all([
    sb.rpc("has_role", { _user_id: userId, _role: "admin" }),
    sb.rpc("has_role", { _user_id: userId, _role: "management" }),
  ]);
  if (!a.data && !m.data) throw new Error("Only admin and management can issue codes.");
}

export type AdminEnablerIssueRow = {
  id: string; name: string; device: "amazon" | "android"; purpose: "install" | "support";
  issuedBy: string | null; createdAt: string; expiresAt: string;
  usedAt: string | null; completedAt: string | null; completedApps: string[]; pinLoggedIn: boolean;
};

/** Admin/management: issue a website code and its own 24-hour Enabler PIN for someone without a website account. */
export const issueAdminEnablerCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    name: z.string().trim().min(1).max(120),
    device: z.enum(["amazon", "android"]),
    purpose: z.enum(["install", "support"]),
    appPaths: z.array(z.string().regex(/^\/api\/public\/tv-install-apk\/[0-9a-f-]{36}$/)).max(40),
  }).parse(i))
  .handler(async ({ data, context }) => {
    await requireAdminOrManagement(context.supabase as never, context.userId);
    if (data.purpose === "install" && data.appPaths.length === 0) throw new Error("Tick at least one app to install.");
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const expiresAt = new Date(Date.now() + ADMIN_ISSUE_TTL_MS).toISOString();
    const { data: issue, error } = await db.from("admin_enabler_issues")
      .insert({ name: data.name, device: data.device, purpose: data.purpose, issued_by: context.userId, expires_at: expiresAt })
      .select("id").single();
    if (error || !issue) throw new Error("Couldn't save the entry. Try again.");
    const secret = process.env["ENABLER_PIN_ENCRYPTION_KEY"] ?? "";
    let pin: string | null = null;
    for (let i = 0; i < 8 && !pin; i++) {
      const p = makePin();
      const { error: e } = await db.from("enabler_login_pins").insert({
        pin_hash: await pinHash(p), pin_encrypted: await encryptPin(p, secret), expires_at: expiresAt, admin_issue_id: issue.id,
      });
      if (!e) pin = p; else if (e.code !== "23505") break;
    }
    let code: string | null = null;
    for (let i = 0; i < 8 && pin && !code; i++) {
      const c = makeHandoffCode();
      const { error: e } = await db.from("enabler_handoffs").insert({
        user_id: context.userId, admin_issue_id: issue.id, code_hash: await sha256Hex(c), device: data.device,
        help_plan: data.purpose === "install" ? 2 : 1, purpose: data.purpose,
        app_paths: data.purpose === "install" ? data.appPaths : [], ticket_id: null, expires_at: expiresAt,
      });
      if (!e) code = c;
    }
    if (!pin || !code) {
      await db.from("admin_enabler_issues").delete().eq("id", issue.id);
      throw new Error("Couldn't make the code and PIN. Try again.");
    }
    return { code, pin, expiresAt };
  });

/** Admin/management: the separate log of every admin-issued code. */
export const listAdminEnablerIssues = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminEnablerIssueRow[]> => {
    await requireAdminOrManagement(context.supabase as never, context.userId);
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { data: issues } = await db.from("admin_enabler_issues").select("*").order("created_at", { ascending: false }).limit(500);
    const ids = (issues ?? []).map((r) => r.id);
    if (!ids.length) return [];
    const [{ data: hs }, { data: pins }, { data: profs }] = await Promise.all([
      db.from("enabler_handoffs").select("admin_issue_id, used_at, completed_at, completed_apps").in("admin_issue_id", ids),
      db.from("enabler_login_pins").select("id, admin_issue_id").in("admin_issue_id", ids),
      db.from("profiles").select("id, username").in("id", [...new Set((issues ?? []).map((r) => r.issued_by))]),
    ]);
    const pinIds = (pins ?? []).map((p) => p.id);
    const { data: toks } = pinIds.length ? await db.from("enabler_device_tokens").select("pin_id").in("pin_id", pinIds) : { data: [] };
    const loggedPins = new Set((toks ?? []).map((t) => t.pin_id));
    return (issues ?? []).map((r) => {
      const h = (hs ?? []).find((x) => x.admin_issue_id === r.id);
      const p = (pins ?? []).find((x) => x.admin_issue_id === r.id);
      return {
        id: r.id, name: r.name, device: r.device as "amazon" | "android", purpose: r.purpose as "install" | "support",
        issuedBy: (profs ?? []).find((x) => x.id === r.issued_by)?.username ?? null,
        createdAt: r.created_at, expiresAt: r.expires_at, usedAt: h?.used_at ?? null,
        completedAt: h?.completed_at ?? null, completedApps: h?.completed_apps ?? [], pinLoggedIn: !!p && loggedPins.has(p.id),
      };
    });
  });
