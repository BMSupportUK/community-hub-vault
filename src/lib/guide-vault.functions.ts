import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createHash, randomInt } from "node:crypto";

const PASSCODE_TTL_MS = 24 * 60 * 60 * 1000;
const SIGNED_URL_SECONDS = 300;
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function hashCode(userId: string, code: string) {
  return createHash("sha256").update(`${userId}:${code.toUpperCase()}`).digest("hex");
}

function makeCode() {
  let out = "";
  for (let i = 0; i < 6; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

/** Issues a fresh 24-hour passcode for the caller on one guide. */
export const requestGuidePasscode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { blogId: string }) => data)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const userId = context.userId;

    const { data: blog, error: blogErr } = await context.supabase
      .from("install_blogs")
      .select("id, title")
      .eq("id", data.blogId)
      .maybeSingle();
    if (blogErr || !blog) throw new Error("Guide not found");

    const now = new Date();
    const expiresAt = new Date(now.getTime() + PASSCODE_TTL_MS);
    const code = makeCode();

    // Retire any code still live for this guide/user so only one works at a time.
    await supabaseAdmin
      .from("guide_passcodes")
      .update({ revoked_at: now.toISOString() })
      .eq("blog_id", data.blogId)
      .eq("user_id", userId)
      .is("revoked_at", null);

    const { error } = await supabaseAdmin.from("guide_passcodes").insert({
      blog_id: data.blogId,
      user_id: userId,
      code_hash: hashCode(userId, code),
      issued_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
    });
    if (error) throw new Error(error.message);

    await supabaseAdmin.from("user_notifications").insert({
      user_id: userId,
      kind: "guide_passcode",
      title: `Guide passcode: ${code}`,
      body: `Use ${code} to unlock "${blog.title}". Valid for 24 hours.`,
      link_path: "/install-guides",
      source_type: "install_blog",
      source_id: data.blogId,
    });

    return { code, expiresAt: expiresAt.toISOString() };
  });

/** Verifies a passcode and returns a short-lived link to the stored guide file. */
export const unlockGuide = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { blogId: string; code: string }) => data)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const userId = context.userId;
    const nowIso = new Date().toISOString();

    const { data: row } = await supabaseAdmin
      .from("guide_passcodes")
      .select("id, expires_at")
      .eq("blog_id", data.blogId)
      .eq("user_id", userId)
      .eq("code_hash", hashCode(userId, (data.code ?? "").trim()))
      .is("revoked_at", null)
      .gt("expires_at", nowIso)
      .maybeSingle();

    if (!row) return { ok: false as const };

    const { data: blog } = await supabaseAdmin
      .from("install_blogs")
      .select("id, title, body, file_path, file_name, file_mime, pdf_url")
      .eq("id", data.blogId)
      .maybeSingle();
    if (!blog) return { ok: false as const };

    // View-only: never issue a download-forcing URL — guides can only be
    // opened inside the app viewer.
    let url: string | null = blog.pdf_url ?? null;
    if (blog.file_path) {
      const { data: signed, error } = await supabaseAdmin.storage
        .from("guide-files")
        .createSignedUrl(blog.file_path, SIGNED_URL_SECONDS);
      if (error) throw new Error(error.message);
      url = signed?.signedUrl ?? null;
    }

    return {
      ok: true as const,
      url,
      viewUrl: blog.file_path
        ? (
            await supabaseAdmin.storage
              .from("guide-files")
              .createSignedUrl(blog.file_path, SIGNED_URL_SECONDS)
          ).data?.signedUrl ?? null
        : url,
      fileName: blog.file_name,
      mime: blog.file_mime,
      body: blog.body,
      expiresAt: row.expires_at,
    };
  });

/** Guides the caller currently holds a live passcode for. */
export const getMyGuideAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("guide_passcodes")
      .select("blog_id, expires_at")
      .eq("user_id", context.userId)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString());
    return (data ?? []).map((r) => ({ blogId: r.blog_id, expiresAt: r.expires_at }));
  });

/** Admin/management: live passcodes across all customers. */
export const listGuidePasscodes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isStaff } = await context.supabase.rpc("has_any_role", {
      _user_id: context.userId,
      _roles: ["admin", "management"],
    });
    if (!isStaff) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin
      .from("guide_passcodes")
      .select("id, blog_id, user_id, issued_at, expires_at")
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("issued_at", { ascending: false })
      .limit(200);

    const list = rows ?? [];
    const userIds = [...new Set(list.map((r) => r.user_id))];
    const blogIds = [...new Set(list.map((r) => r.blog_id))];
    const [{ data: profiles }, { data: blogs }] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, username, display_name").in("id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]),
      supabaseAdmin.from("install_blogs").select("id, title").in("id", blogIds.length ? blogIds : ["00000000-0000-0000-0000-000000000000"]),
    ]);
    const nameOf = new Map((profiles ?? []).map((p) => [p.id, p.display_name || p.username || "Member"]));
    const titleOf = new Map((blogs ?? []).map((b) => [b.id, b.title]));

    return list.map((r) => ({
      id: r.id,
      blogId: r.blog_id,
      guide: titleOf.get(r.blog_id) ?? "Guide",
      member: nameOf.get(r.user_id) ?? "Member",
      issuedAt: r.issued_at,
      expiresAt: r.expires_at,
    }));
  });

/** Admin/management: revoke a live passcode. */
export const revokeGuidePasscode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data, context }) => {
    const { data: isStaff } = await context.supabase.rpc("has_any_role", {
      _user_id: context.userId,
      _roles: ["admin", "management"],
    });
    if (!isStaff) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("guide_passcodes")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
