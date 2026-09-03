import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { randomInt } from "node:crypto";

const TRANSFER_TTL_MS = 24 * 60 * 60 * 1000;
// Unambiguous on a TV remote keypad: no O/0, I/1, L.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function makeToken(len = 8) {
  let out = "";
  for (let i = 0; i < len; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

async function requireStaff(context: { supabase: any; userId: string }) {
  const { data } = await context.supabase.rpc("has_any_role", {
    _user_id: context.userId,
    _roles: ["admin", "management"],
  });
  if (!data) throw new Error("Forbidden");
}

/** Staff, management and admin may watch live transfers. */
async function requireStaffView(context: { supabase: any; userId: string }) {
  const { data } = await context.supabase.rpc("has_any_role", {
    _user_id: context.userId,
    _roles: ["admin", "management", "staff"],
  });
  if (!data) throw new Error("Forbidden");
}

function mapBuild(data: any) {
  return {
    id: data.id as string,
    appName: (data.app_name as string | null) ?? null,
    fileName: data.file_name as string,
    fileSize: (data.file_size as number | null) ?? null,
    versionName: (data.version_name as string | null) ?? null,
    releaseNotes: (data.release_notes as string | null) ?? null,
    isAvailable: !!data.is_available,
    videoPath: (data.video_path as string | null) ?? null,
    sortOrder: (data.sort_order as number | null) ?? 0,
    installInstructions: (data.install_instructions as string | null) ?? null,
    announceUpdates: !!data.announce_updates,
    createdAt: data.created_at as string,
  };
}

/** Metadata for the current downloadable app build (no storage path exposed). */
export const getCurrentAppBuild = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("app_builds")
      .select("id, file_name, file_size, version_name, release_notes, is_available, created_at")
      .eq("is_current", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!data) return null;
    return {
      id: data.id as string,
      fileName: data.file_name as string,
      fileSize: (data.file_size as number | null) ?? null,
      versionName: (data.version_name as string | null) ?? null,
      releaseNotes: (data.release_notes as string | null) ?? null,
      isAvailable: !!data.is_available,
      createdAt: data.created_at as string,
    };
  });

/** All app cards members can install (available builds only). */
export const listAppBuilds = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("app_builds")
      .select(
        "id, app_name, file_name, file_size, version_name, release_notes, is_available, video_path, sort_order, install_instructions, announce_updates, created_at",
      )
      .eq("is_current", true)
      .eq("is_available", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });
    return (data ?? []).map(mapBuild);
  });

/** Admin: every app card, including ones hidden from members. */
export const listAppBuildsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireStaff(context);
    const { data } = await context.supabase
      .from("app_builds")
      .select(
        "id, app_name, file_name, file_size, version_name, release_notes, is_available, video_path, sort_order, install_instructions, announce_updates, created_at",
      )
      .eq("is_current", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });
    return (data ?? []).map(mapBuild);
  });

/** All of the caller's live transfers, one per app. */
export const listMyAppTransfers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const nowIso = new Date().toISOString();
    const { data } = await context.supabase
      .from("app_transfers")
      .select("id, build_id, token, issued_at, expires_at, download_count")
      .eq("user_id", context.userId)
      .gt("expires_at", nowIso)
      .order("issued_at", { ascending: false });
    return (data ?? []).map((row: any) => ({
      id: row.id as string,
      buildId: row.build_id as string,
      token: row.token as string,
      issuedAt: row.issued_at as string,
      expiresAt: row.expires_at as string,
      downloads: (row.download_count as number) ?? 0,
    }));
  });

/** Admin: removes an app card and its stored files. */
export const deleteAppBuild = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data, context }) => {
    await requireStaff(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("app_builds")
      .select("file_path, video_path")
      .eq("id", data.id)
      .maybeSingle();
    const { error } = await supabaseAdmin.from("app_builds").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    if (row?.file_path) await supabaseAdmin.storage.from("app-builds").remove([row.file_path]);
    if (row?.video_path) await supabaseAdmin.storage.from("app-demos").remove([row.video_path]);
    return { ok: true as const };
  });

/** The caller's live transfer, if any. */
export const getMyAppTransfer = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const nowIso = new Date().toISOString();
    const { data } = await context.supabase
      .from("app_transfers")
      .select("id, token, issued_at, expires_at, download_count")
      .eq("user_id", context.userId)
      .gt("expires_at", nowIso)
      .order("issued_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!data) return null;
    return {
      id: data.id as string,
      token: data.token as string,
      issuedAt: data.issued_at as string,
      expiresAt: data.expires_at as string,
      downloads: (data.download_count as number) ?? 0,
    };
  });

/** Issues a fresh 24-hour transfer, replacing any existing one for the caller. */
export const requestAppTransfer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data?: { buildId?: string | null }) => data ?? {})
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const userId = context.userId;

    let query = supabaseAdmin.from("app_builds").select("id, is_available").eq("is_current", true);
    if (data?.buildId) query = query.eq("id", data.buildId);
    const { data: build } = await query
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!build || !build.is_available) throw new Error("The app download isn't available right now.");

    // Nothing is retained: the previous transfer for this app is hard-deleted.
    await supabaseAdmin
      .from("app_transfers")
      .delete()
      .eq("user_id", userId)
      .eq("build_id", build.id);

    const expiresAt = new Date(Date.now() + TRANSFER_TTL_MS);
    let token = makeToken();
    for (let attempt = 0; attempt < 5; attempt++) {
      const { error } = await supabaseAdmin.from("app_transfers").insert({
        user_id: userId,
        build_id: build.id,
        token,
        expires_at: expiresAt.toISOString(),
      });
      if (!error) return { token, expiresAt: expiresAt.toISOString(), buildId: build.id as string };
      if (!`${error.message}`.toLowerCase().includes("duplicate")) throw new Error(error.message);
      token = makeToken();
    }
    throw new Error("Couldn't create a transfer, please try again.");
  });

/** Hard-deletes the caller's transfer so the link stops working and no record remains. */
export const deleteMyAppTransfer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data?: { buildId?: string | null }) => data ?? {})
  .handler(async ({ data, context }) => {
    let del = context.supabase.from("app_transfers").delete().eq("user_id", context.userId);
    if (data?.buildId) del = del.eq("build_id", data.buildId);
    const { error } = await del;
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/** Admin: records a newly uploaded APK as the current build. */
export const saveAppBuild = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      filePath: string;
      fileName: string;
      fileSize?: number | null;
      versionName?: string | null;
      releaseNotes?: string | null;
      isAvailable?: boolean;
      appName?: string | null;
      videoPath?: string | null;
      sortOrder?: number | null;
      installInstructions?: string | null;
      announceUpdates?: boolean;
    }) => data,
  )
  .handler(async ({ data, context }) => {
    await requireStaff(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: inserted, error } = await supabaseAdmin
      .from("app_builds")
      .insert({
        file_path: data.filePath,
        file_name: data.fileName,
        file_size: data.fileSize ?? null,
        version_name: data.versionName ?? null,
        release_notes: data.releaseNotes ?? null,
        app_name: data.appName ?? null,
        video_path: data.videoPath ?? null,
        sort_order: data.sortOrder ?? 0,
        install_instructions: data.installInstructions ?? null,
        announce_updates: data.announceUpdates ?? false,
        is_current: true,
        is_available: data.isAvailable ?? true,
        created_by: context.userId,
      } as never)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);

    // Only our own BM Support Android app announces releases to members — once.
    try {
      if (data.announceUpdates && (data.isAvailable ?? true) && inserted?.id) {
        const { announceAppUpdate } = await import("@/lib/app-update-announce.server");
        await announceAppUpdate({
          buildId: inserted.id as string,
          appName: data.appName ?? null,
          fileName: data.fileName,
          versionName: data.versionName ?? null,
          releaseNotes: data.releaseNotes ?? null,
        });
      }
    } catch (e) {
      console.warn("[app-build] update announcement failed", e);
    }

    return { id: inserted?.id as string };
  });


/** Admin: toggles whether members can request a transfer, or edits build details. */
export const updateAppBuild = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      id: string;
      versionName?: string | null;
      releaseNotes?: string | null;
      isAvailable?: boolean;
      appName?: string | null;
      videoPath?: string | null;
      sortOrder?: number | null;
      installInstructions?: string | null;
      filePath?: string | null;
      fileName?: string | null;
      fileSize?: number | null;
      announceUpdates?: boolean;
    }) => data,
  )
  .handler(async ({ data, context }) => {
    await requireStaff(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: Record<string, any> = {};
    if (data.versionName !== undefined) patch.version_name = data.versionName;
    if (data.releaseNotes !== undefined) patch.release_notes = data.releaseNotes;
    if (data.isAvailable !== undefined) patch.is_available = data.isAvailable;
    if (data.appName !== undefined) patch.app_name = data.appName;
    if (data.videoPath !== undefined) patch.video_path = data.videoPath;
    if (data.sortOrder !== undefined && data.sortOrder !== null) patch.sort_order = data.sortOrder;
    if (data.installInstructions !== undefined) patch.install_instructions = data.installInstructions;
    if (data.filePath !== undefined && data.filePath) patch.file_path = data.filePath;
    if (data.fileName !== undefined && data.fileName) patch.file_name = data.fileName;
    if (data.fileSize !== undefined) patch.file_size = data.fileSize;
    if (data.announceUpdates !== undefined) patch.announce_updates = data.announceUpdates;
    const { error } = await supabaseAdmin.from("app_builds").update(patch as never).eq("id", data.id);
    if (error) throw new Error(error.message);

    // Only our own BM Support Android app alerts members. A replaced APK or a
    // bumped version is a new release; cosmetic edits never alert.
    try {
      const isNewRelease = !!patch.file_path || data.versionName !== undefined;
      if (isNewRelease) {
        const { data: row } = await supabaseAdmin
          .from("app_builds")
          .select("id, app_name, file_name, version_name, release_notes, is_available, announce_updates")
          .eq("id", data.id)
          .maybeSingle();
        if (row?.is_available && (row as { announce_updates?: boolean }).announce_updates) {
          const { announceAppUpdate } = await import("@/lib/app-update-announce.server");
          await announceAppUpdate({
            buildId: row.id as string,
            appName: (row.app_name as string | null) ?? null,
            fileName: row.file_name as string,
            versionName: (row.version_name as string | null) ?? null,
            releaseNotes: (row.release_notes as string | null) ?? null,
          });
        }
      }
    } catch (e) {
      console.warn("[app-build] update announcement failed", e);
    }

    return { ok: true as const };
  });


/** Staff: live transfers with the member they belong to and download progress. */
export const listAppTransfers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireStaffView(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const cutoff = new Date(Date.now() - 24 * 3_600_000).toISOString();
    await supabaseAdmin
      .from("app_transfers")
      .delete()
      .eq("last_download_status", "completed")
      .lt("last_download_at", cutoff);
    const { data } = await supabaseAdmin
      .from("app_transfers")
      .select(
        "id, user_id, build_id, token, issued_at, expires_at, download_count, last_download_at, last_download_status, last_download_started_at, last_download_bytes, last_download_total_bytes, last_download_device, last_download_user_agent, last_download_ip",
      )
      .order("issued_at", { ascending: false })
      .limit(200);
    const rows = data ?? [];
    const buildIds = [...new Set(rows.map((r) => r.build_id).filter(Boolean) as string[])];
    const appNames = new Map<string, string>();
    if (buildIds.length) {
      const { data: builds } = await supabaseAdmin
        .from("app_builds")
        .select("id, app_name, file_name")
        .in("id", buildIds);
      for (const b of builds ?? [])
        appNames.set(b.id as string, ((b.app_name as string | null) || (b.file_name as string)) ?? "App");
    }
    const ids = [...new Set(rows.map((r) => r.user_id))];
    const names = new Map<string, { member: string; username: string | null }>();
    if (ids.length) {
      const { data: profiles } = await supabaseAdmin
        .from("profiles")
        .select("id, display_name, username")
        .in("id", ids);
      for (const p of profiles ?? []) {
        names.set(p.id, {
          member: (p.display_name as string) || (p.username as string) || "Member",
          username: (p.username as string | null) ?? null,
        });
      }
    }
    return rows.map((r) => ({
      id: r.id as string,
      member: names.get(r.user_id)?.member ?? "Member",
      username: names.get(r.user_id)?.username ?? null,
      appName: appNames.get(r.build_id as string) ?? "App",
      token: r.token as string,
      expired: new Date(r.expires_at as string).getTime() <= Date.now(),
      issuedAt: r.issued_at as string,
      expiresAt: r.expires_at as string,
      downloads: (r.download_count as number) ?? 0,
      lastDownloadAt: (r.last_download_at as string | null) ?? null,
      status: (r.last_download_status as string | null) ?? null,
      startedAt: (r.last_download_started_at as string | null) ?? null,
      bytes: Number(r.last_download_bytes ?? 0),
      totalBytes: r.last_download_total_bytes == null ? null : Number(r.last_download_total_bytes),
      device: (r.last_download_device as string | null) ?? null,
      userAgent: (r.last_download_user_agent as string | null) ?? null,
      ip: (r.last_download_ip as string | null) ?? null,
    }));
  });

/** Admin: kills a member's transfer immediately. */
export const deleteAppTransferAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data, context }) => {
    await requireStaff(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("app_transfers").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/**
 * Non-subscriber members can ask for access to the BM App Store download
 * section. This notifies staff/admin rather than issuing a link.
 */
export const requestAppDownloadAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data?: { section?: "download" | "guides" }) => ({
    section: data?.section === "guides" ? ("guides" as const) : ("download" as const),
  }))
  .handler(async ({ data, context }) => {
    const isGuides = data.section === "guides";
    const kind = isGuides ? "install_guides_access_request" : "app_download_access_request";
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("display_name, username")
      .eq("id", context.userId)
      .maybeSingle();
    const who = profile?.display_name || profile?.username || "A member";

    // Don't spam: one open request per member per hour.
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: recent } = await supabaseAdmin
      .from("staff_notifications")
      .select("id")
      .eq("kind", kind)
      .eq("entity_id", context.userId)
      .gte("created_at", since)
      .limit(1);
    if (recent && recent.length) return { ok: true as const, alreadySent: true };

    const { error } = await supabaseAdmin.from("staff_notifications").insert({
      kind,
      title: isGuides ? "Install guides access requested" : "App download access requested",
      body: isGuides
        ? `${who} wants access to the install guides.`
        : `${who} wants access to the BM App Store download section.`,
      // Staff notification: send admins straight to the approval queue.
      link_path: "/install-guides?tab=approvals",
      entity_id: context.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const, alreadySent: false };
  });
