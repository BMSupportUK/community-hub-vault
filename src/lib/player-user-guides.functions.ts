import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { KB_FRONT_GUIDE_IDS } from "@/lib/knowledge-base-front-page";

const GUIDE_FILES = ["bm-player-getting-started", "bm-player-fire-tv-android-tv", "bm-player-android-phone", "bm-player-windows-mac"];

export const openPlayerUserGuide = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { articleId: string }) => {
    if (!input || typeof input.articleId !== "string") throw new Error("Invalid guide");
    return input;
  })
  .handler(async ({ data, context }) => {
    const index = KB_FRONT_GUIDE_IDS.findIndex((id) => id === data.articleId);
    if (index < 0) throw new Error("Guide unavailable");
    const { data: article, error } = await context.supabase.from("kb_articles")
      .select("id,published").eq("id", data.articleId).eq("published", true).maybeSingle();
    if (error || !article) throw new Error("Guide unavailable");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: file, error: fileError } = await supabaseAdmin.storage.from("guide-files")
      .download(`bm-player-user-guides/${GUIDE_FILES[index]}-v2.pdf`);
    if (fileError || !file) throw new Error("This guide could not be opened. Please try again.");
    // No public or signed storage link is exposed to the reader.
    return { pdf: Buffer.from(await file.arrayBuffer()).toString("base64") };
  });