import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const ALLOWED_BUCKETS = ["blog-headers"] as const;

export const generateHeaderImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        prompt: z.string().min(3).max(500),
        bucket: z.enum(ALLOWED_BUCKETS).default("blog-headers"),
        folder: z.string().max(64).regex(/^[a-zA-Z0-9_-]*$/).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { userId, supabase } = context;

    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const allowed = (roles ?? []).some((r) =>
      ["admin", "management", "staff"].includes(r.role as string),
    );
    if (!allowed) throw new Error("Forbidden");

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("AI not configured");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-image",
        messages: [
          {
            role: "user",
            content: `Design a wide 1600x600 article header cover image. ${data.prompt}. Editorial quality, cinematic lighting, clean composition, no text overlay.`,
          },
        ],
        modalities: ["image", "text"],
      }),
    });

    if (!res.ok) {
      const t = await res.text();
      if (res.status === 429) throw new Error("Rate limit reached. Please try again shortly.");
      if (res.status === 402) throw new Error("AI credits exhausted. Please add credits in workspace settings.");
      throw new Error(`AI error: ${res.status} ${t.slice(0, 200)}`);
    }
    const json = await res.json();
    const dataUrl: string | undefined =
      json?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!dataUrl) throw new Error("No image returned");

    const base64 = dataUrl.split(",")[1];
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const prefix = data.folder ? `${data.folder}/` : "";
    const path = `${prefix}${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`;
    const { error: upErr } = await supabaseAdmin.storage
      .from(data.bucket)
      .upload(path, bytes, { contentType: "image/png", upsert: false });
    if (upErr) throw new Error(upErr.message);

    const { data: pub } = supabaseAdmin.storage.from(data.bucket).getPublicUrl(path);
    return { url: pub.publicUrl };
  });