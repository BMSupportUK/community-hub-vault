import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { DIRECT_LINK_TTL_MS, directInstallUrl, makeDirectCode } from "@/lib/direct-install";
import { sha256Hex } from "@/lib/enabler-handoff";

/** Signed-in customer asks for a 30-minute BM Direct Install download link for Downloader. */
export const createDirectInstallLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const expiresAt = new Date(Date.now() + DIRECT_LINK_TTL_MS).toISOString();
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = makeDirectCode();
      const { error } = await db.from("direct_install_links").insert({ user_id: context.userId, code_hash: await sha256Hex(code), expires_at: expiresAt });
      if (!error) return { code, url: directInstallUrl(code), expiresAt };
      if (error.code !== "23505") { console.error("direct install link insert failed:", error); break; }
    }
    throw new Error("Couldn't make a download link. Please try again.");
  });

/** Latest download link's progress, reported by the website and the BM Direct Install TV app. */
export const getDirectInstallProgress = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.from("direct_install_links")
      .select("created_at, downloaded_at, signed_in_at, permission_at, code_at, completed_at")
      .eq("user_id", context.userId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    return data ?? null;
  });
