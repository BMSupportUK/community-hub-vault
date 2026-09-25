import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertStaff(supabase: any, userId: string) {
  const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (error) throw new Error(error.message);
  const roles: string[] = (data ?? []).map((r: any) => String(r.role));
  if (!roles.some((r) => ["admin", "management", "staff"].includes(r))) throw new Error("Forbidden");
}

const FlaggedEvent = z.object({
  n: z.number().int().min(1),
  date: z.string().nullable(),
  time: z.string().max(40),
  title: z.string().max(300),
  channels: z.array(z.string().max(80)).max(20),
  problems: z.array(z.enum(["time", "title", "channel"])).min(1),
});

export type ListingFixSuggestion = {
  n: number;
  time?: string;
  title?: string;
  channels?: string[];
  reason: string;
  source?: string;
};

async function webSearch(query: string, apiKey: string) {
  const res = await fetch("https://api.firecrawl.dev/v2/search", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, limit: 4, location: "United Kingdom" }),
  });
  if (!res.ok) {
    console.error(`Web search failed [${res.status}]: ${await res.text()}`);
    return [];
  }
  const json: any = await res.json();
  const web: any[] = json?.data?.web ?? json?.data ?? [];
  return web.slice(0, 4).map((r) => ({
    title: String(r.title ?? ""),
    url: String(r.url ?? ""),
    snippet: String(r.description ?? r.snippet ?? "").slice(0, 400),
  }));
}

/** Looks up flagged listing rows on the web and suggests fixes. Never writes anything. */
export const suggestListingFixes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ guide: z.string().max(200).optional(), events: z.array(FlaggedEvent).min(1).max(15) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const fcKey = process.env.FIRECRAWL_API_KEY;
    const aiKey = process.env.LOVABLE_API_KEY;
    if (!fcKey || !aiKey) throw new Error("Web lookup isn't set up");

    const found = await Promise.all(
      data.events.map(async (e) => {
        const q = `${e.title || e.channels.join(" ")} ${e.date ?? ""} ${data.guide ?? ""} start time UK TV channel`.replace(/\s+/g, " ").trim();
        return { n: e.n, results: await webSearch(q, fcKey) };
      }),
    );

    const prompt = [
      "You repair sports TV listing rows. For each row, use ONLY the web results given to fill the flagged problems.",
      "Times must be UK time (Europe/London), 24-hour HH:MM. Keep channel names in the listing's own style (e.g. 'ESPN 4 HD').",
      "If the results don't clearly confirm a fix, omit that row. Never guess.",
      "",
      `Guide: ${data.guide ?? "unknown"}`,
      ...data.events.map((e) => {
        const r = found.find((f) => f.n === e.n)?.results ?? [];
        return [
          `ROW ${e.n}: date=${e.date ?? "?"} time=${e.time || "?"} title=${JSON.stringify(e.title)} channels=${JSON.stringify(e.channels)} problems=${e.problems.join(",")}`,
          ...r.map((x) => `  - ${x.title} | ${x.url} | ${x.snippet}`),
        ].join("\n");
      }),
    ].join("\n");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${aiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [{ role: "user", content: prompt }],
        tools: [{
          type: "function",
          function: {
            name: "suggest",
            parameters: {
              type: "object",
              properties: {
                fixes: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      n: { type: "integer" },
                      time: { type: "string" },
                      title: { type: "string" },
                      channels: { type: "array", items: { type: "string" } },
                      reason: { type: "string" },
                      source: { type: "string" },
                    },
                    required: ["n", "reason"],
                  },
                },
              },
              required: ["fixes"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "suggest" } },
      }),
    });
    if (res.status === 429) throw new Error("Too many lookups right now — try again in a minute");
    if (res.status === 402) throw new Error("Out of AI credits — top up to use web lookups");
    if (!res.ok) throw new Error(`Lookup failed [${res.status}]: ${(await res.text()).slice(0, 200)}`);
    const json: any = await res.json();
    const args = json?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    let fixes: ListingFixSuggestion[] = [];
    try { fixes = JSON.parse(args ?? "{}").fixes ?? []; } catch { fixes = []; }
    const allowed = new Set(data.events.map((e) => e.n));
    return {
      fixes: fixes
        .filter((f) => allowed.has(f.n) && (f.time || f.title || f.channels?.length))
        .map((f) => ({ ...f, time: f.time && /^\d{1,2}:\d{2}$/.test(f.time.trim()) ? f.time.trim() : undefined })),
    };
  });

/** Saves an approved, corrected listing back onto the pending queue post. */
export const saveQueueListing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), raw: z.string().min(1).max(50_000) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: item, error } = await supabaseAdmin
      .from("discord_import_queue")
      .select("id, parsed_event, status")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!item || item.status !== "pending") throw new Error("This post is no longer pending");
    const { error: upErr } = await supabaseAdmin
      .from("discord_import_queue")
      .update({ raw_text: data.raw, parsed_event: { ...((item.parsed_event as any) ?? {}), raw: data.raw } })
      .eq("id", data.id);
    if (upErr) throw new Error(upErr.message);
    return { ok: true };
  });
