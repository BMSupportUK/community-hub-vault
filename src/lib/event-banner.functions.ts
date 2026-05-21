import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const generateEventBanner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ prompt: z.string().min(3).max(500), eventId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId, supabase } = context;

    // Verify role
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const allowed = (roles ?? []).some((r) => ["admin", "management", "staff"].includes(r.role as string));
    if (!allowed) throw new Error("Forbidden");

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("AI not configured");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-image",
        messages: [
          { role: "user", content: `Design a vibrant 300x250 event advertising banner. ${data.prompt}. Bold readable text, modern design, eye-catching colors.` },
        ],
        modalities: ["image", "text"],
      }),
    });

    if (!res.ok) {
      const t = await res.text();
      throw new Error(`AI error: ${res.status} ${t.slice(0, 200)}`);
    }
    const json = await res.json();
    const dataUrl: string | undefined = json?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!dataUrl) throw new Error("No image returned");

    const base64 = dataUrl.split(",")[1];
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const path = `${data.eventId}/${Date.now()}.png`;
    const { error: upErr } = await supabaseAdmin.storage
      .from("event-banners")
      .upload(path, bytes, { contentType: "image/png", upsert: true });
    if (upErr) throw new Error(upErr.message);

    const { data: pub } = supabaseAdmin.storage.from("event-banners").getPublicUrl(path);
    const url = pub.publicUrl;

    const { error: updErr } = await supabaseAdmin
      .from("upcoming_event")
      .update({ banner_url: url, updated_by: userId })
      .eq("id", data.eventId);
    if (updErr) throw new Error(updErr.message);

    return { url };
  });