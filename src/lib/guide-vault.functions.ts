import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SIGNED_URL_SECONDS = 300;

/**
 * Returns a short-lived, view-only link to a stored guide for any signed-in
 * member who can reach the Guides tab. Passcodes are no longer required.
 */
export const openGuide = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { blogId: string }) => data)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: blog } = await supabaseAdmin
      .from("install_blogs")
      .select("id, title, body, file_path, file_name, file_mime, pdf_url")
      .eq("id", data.blogId)
      .maybeSingle();
    if (!blog) return { ok: false as const };

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
      viewUrl: url,
      fileName: blog.file_name,
      mime: blog.file_mime,
      body: blog.body,
    };
  });
