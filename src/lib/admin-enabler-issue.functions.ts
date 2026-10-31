import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ADMIN_ISSUE_TTL_MS, makeHandoffCode, sha256Hex } from "@/lib/enabler-handoff";
import { makePin, pinHash } from "@/lib/enabler-pin";
import { encryptPin } from "@/lib/enabler-pin-crypto.server";
import { adminInstallerCodeSchema, adminInstallerPinTtl, requireAdminInstallerAccess } from "@/lib/admin-installer-code";

export type AdminEnablerIssueRow = {
  id: string; name: string; device: "amazon" | "android"; purpose: "install" | "support";
  issuedBy: string | null; createdAt: string; expiresAt: string;
  usedAt: string | null; completedAt: string | null; completedApps: string[]; pinLoggedIn: boolean;
  signedInAt: string | null; permissionAt: string | null;
  installer: "direct" | "enabler"; apps: string[];
};

/** Admin/management: issue a website code and its own 24-hour Enabler PIN for someone without a website account. */
export const issueAdminEnablerCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => adminInstallerCodeSchema.parse(i))
  .handler(async ({ data, context }) => {
    await requireAdminInstallerAccess(context.supabase as never, context.userId);
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    if (data.purpose === "install") {
      const ids = data.appPaths.map((p) => p.split("/").at(-1) ?? "");
      const { data: available, error: appError } = await db.from("app_builds").select("id").in("id", ids)
        .eq("install_on_tv", true).eq("is_available", true).eq("is_current", true).not("file_path", "is", null).ilike("file_name", "%.apk");
      if (appError || ids.some((id) => !available?.some((a) => a.id === id))) throw new Error("An app is no longer available. Refresh the app list and try again.");
    }
    const expiresAt = new Date(Date.now() + ADMIN_ISSUE_TTL_MS).toISOString();
    const pinExpiresAt = new Date(Date.now() + adminInstallerPinTtl(data.installer)).toISOString();
    const { data: issue, error } = await db.from("admin_enabler_issues")
      .insert({ name: data.name, device: data.device, purpose: data.purpose, issued_by: context.userId, expires_at: expiresAt })
      .select("id").single();
    if (error || !issue) throw new Error("Couldn't save the entry. Try again.");
    const secret = process.env["ENABLER_PIN_ENCRYPTION_KEY"] ?? "";
    let pin: string | null = null;
    for (let i = 0; i < 8 && !pin; i++) {
      const p = makePin();
      const { error: e } = await db.from("enabler_login_pins").insert({
        pin_hash: await pinHash(p), pin_encrypted: await encryptPin(p, secret), expires_at: pinExpiresAt, admin_issue_id: issue.id, kind: data.installer,
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
      await db.from("enabler_login_pins").delete().eq("admin_issue_id", issue.id);
      await db.from("enabler_handoffs").delete().eq("admin_issue_id", issue.id);
      await db.from("admin_enabler_issues").delete().eq("id", issue.id);
      throw new Error("Couldn't make the code and PIN. Try again.");
    }
    return { code, pin, expiresAt, pinExpiresAt };
  });

/** Admin/management: the separate log of every admin-issued code. */
export const listAdminEnablerIssues = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminEnablerIssueRow[]> => {
    await requireAdminInstallerAccess(context.supabase as never, context.userId);
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { data: issues } = await db.from("admin_enabler_issues").select("*").order("created_at", { ascending: false }).limit(500);
    const ids = (issues ?? []).map((r) => r.id);
    if (!ids.length) return [];
    const [{ data: hs }, { data: pins }, { data: profs }] = await Promise.all([
      db.from("enabler_handoffs").select("admin_issue_id, used_at, completed_at, completed_apps, app_paths, signed_in_at, permission_at").in("admin_issue_id", ids),
      db.from("enabler_login_pins").select("id, admin_issue_id, kind").in("admin_issue_id", ids),
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
        signedInAt: h?.signed_in_at ?? null, permissionAt: h?.permission_at ?? null,
        installer: p?.kind === "direct" ? "direct" : "enabler", apps: h?.app_paths ?? [],
      };
    });
  });
