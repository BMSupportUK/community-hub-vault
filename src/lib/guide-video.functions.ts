import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SIGNED_URL_SECONDS = 900;
const SECURE_BUCKET = "guide-videos";
const SECURE_PREFIX = `${SECURE_BUCKET}:`;

/** Pulls bucket + path out of a Supabase storage public/sign URL. */
function parseStorageUrl(url: string): { bucket: string; path: string } | null {
  const m = url.match(/\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/(.+?)(?:\?|$)/);
  if (!m) return null;
  return { bucket: m[1], path: decodeURIComponent(m[2]) };
}

/**
 * Resolves a guide video reference into a short-lived signed URL.
 *
 * Videos live in the private `guide-videos` bucket and are never served from a
 * public URL. Legacy rows that still point at the old public bucket are moved
 * into the private bucket on first playback, then signed.
 */
export const getGuideVideoUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { ref: string; blogId?: string }) => data)
  .handler(async ({ data }) => {
    const ref = (data.ref ?? "").trim();
    if (!ref) return { url: null as string | null };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const sign = async (path: string) => {
      const { data: signed, error } = await supabaseAdmin.storage
        .from(SECURE_BUCKET)
        .createSignedUrl(path, SIGNED_URL_SECONDS);
      if (error) throw new Error(error.message);
      return signed?.signedUrl ?? null;
    };

    if (ref.startsWith(SECURE_PREFIX)) {
      return { url: await sign(ref.slice(SECURE_PREFIX.length)) };
    }

    const parsed = parseStorageUrl(ref);
    if (parsed) {
      if (parsed.bucket === SECURE_BUCKET) return { url: await sign(parsed.path) };

      // Legacy public-bucket video: move it behind the private bucket.
      const target = `migrated/${parsed.path}`;
      const { data: file, error: dlErr } = await supabaseAdmin.storage
        .from(parsed.bucket)
        .download(parsed.path);
      if (dlErr || !file) {
        // File is gone from the old bucket — nothing safe to serve.
        return { url: null as string | null };
      }
      const { error: upErr } = await supabaseAdmin.storage
        .from(SECURE_BUCKET)
        .upload(target, file, { upsert: true, contentType: file.type || "video/mp4" });
      if (upErr && !/exists/i.test(upErr.message)) throw new Error(upErr.message);

      if (data.blogId) {
        await supabaseAdmin
          .from("install_blogs")
          .update({ video_url: `${SECURE_PREFIX}${target}` })
          .eq("id", data.blogId);
      }
      await supabaseAdmin.storage.from(parsed.bucket).remove([parsed.path]);
      return { url: await sign(target) };
    }

    // External link (not our storage) — pass through untouched.
    return { url: ref };
  });
