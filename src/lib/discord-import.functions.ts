import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { routeEvent } from "./discord-sport-keywords";

const STAFF_ROLES = ["admin", "management", "moderator"] as const;

async function assertStaff(supabase: any, userId: string) {
  const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (error) throw new Error(error.message);
  const roles: string[] = (data ?? []).map((r: any) => String(r.role));
  if (!roles.some((r) => (STAFF_ROLES as readonly string[]).includes(r))) {
    throw new Error("Forbidden: staff only");
  }
}

export type ParsedEvent = {
  title: string;
  time: string | null;
  date: string | null;
  channels: string[];
  raw: string;
};

export type RoutedEvent = ParsedEvent & {
  category: string | null;
  subcategory: string | null;
  matched: boolean;
};

// ── AI Splitter ────────────────────────────────────────────────────
// Uses Lovable AI Gateway (no key needed beyond LOVABLE_API_KEY) to break
// the pasted Discord text into one object per event. The model returns
// strict JSON; we validate and route each event with the keyword map.

const SYSTEM_PROMPT = `You extract individual sports broadcast events from raw Discord channel text.

Each event has:
- title: the sport / match / fixture name (e.g. "Manchester United vs Liverpool", "UFC 300", "IPL: Mumbai vs Chennai", "Greyhound Racing - Romford")
- time: kickoff/start time as written (e.g. "19:45 GMT", "2:30pm UK", "9:30am ET") or null
- date: date as written (e.g. "Saturday 1 January 2026") or null if not present
- channels: array of broadcast channels/streams listed for that event (e.g. ["Sky Sports Main Event", "TNT Sports 1"]) — empty array if none
- raw: the verbatim chunk of original text this event came from

Rules:
- One object per event/fixture. If a message lists 5 matches, return 5 objects.
- Ignore decorative dividers, emojis, role pings, "auto-deletes in 24h" notices, "posted by" lines.
- If the same date/header applies to multiple events below it, copy that date onto each event.
- Output STRICT JSON: { "events": [ ... ] }. No prose, no markdown fences.`;

async function splitWithAI(text: string): Promise<ParsedEvent[]> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("AI service not configured (missing LOVABLE_API_KEY)");

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": key,
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: text },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (res.status === 429) throw new Error("AI rate-limited. Try again in a moment.");
  if (res.status === 402) throw new Error("AI credits exhausted. Add credits in Workspace settings.");
  if (!res.ok) throw new Error(`AI service error (${res.status})`);

  const json = await res.json();
  const content = json?.choices?.[0]?.message?.content;
  if (!content || typeof content !== "string") throw new Error("AI returned empty response");

  let parsed: any;
  try {
    parsed = JSON.parse(content);
  } catch {
    // Strip code fences if model added them
    const stripped = content.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
    parsed = JSON.parse(stripped);
  }

  const events = Array.isArray(parsed?.events) ? parsed.events : [];
  return events
    .map((e: any): ParsedEvent => ({
      title: String(e?.title ?? "").trim(),
      time: e?.time ? String(e.time).trim() : null,
      date: e?.date ? String(e.date).trim() : null,
      channels: Array.isArray(e?.channels) ? e.channels.map((c: any) => String(c).trim()).filter(Boolean) : [],
      raw: String(e?.raw ?? "").trim(),
    }))
    .filter((e: ParsedEvent) => e.title.length > 0);
}

function routeEvents(events: ParsedEvent[]): RoutedEvent[] {
  return events.map((ev) => {
    const haystack = `${ev.title} ${ev.channels.join(" ")}`;
    const m = routeEvent(haystack);
    return {
      ...ev,
      category: m?.category ?? null,
      subcategory: m?.subcategory ?? null,
      matched: m !== null,
    };
  });
}

// ── Public server functions ───────────────────────────────────────

const ParseInput = z.object({
  text: z.string().min(1).max(50_000),
});

export const parseDiscordPaste = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ParseInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertStaff(supabase, userId);
    const parsed = await splitWithAI(data.text);
    const routed = routeEvents(parsed);
    return {
      matched: routed.filter((e) => e.matched),
      unmatched: routed.filter((e) => !e.matched),
    };
  });

const ImportInput = z.object({
  events: z
    .array(
      z.object({
        title: z.string().min(1).max(500),
        time: z.string().max(100).nullable().optional(),
        date: z.string().max(100).nullable().optional(),
        channels: z.array(z.string().max(200)).max(50).optional(),
        raw: z.string().max(5000).optional(),
        category: z.string().min(1).max(100),
        subcategory: z.string().max(100).nullable().optional(),
      }),
    )
    .min(1)
    .max(500),
});

function buildBody(ev: { time?: string | null; date?: string | null; channels?: string[]; raw?: string }) {
  const parts: string[] = [];
  if (ev.date) parts.push(ev.date);
  if (ev.time) parts.push(ev.time);
  if (ev.channels && ev.channels.length) parts.push(ev.channels.join(" • "));
  if (parts.length === 0 && ev.raw) parts.push(ev.raw);
  return parts.join("\n");
}

export const importParsedEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ImportInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertStaff(supabase, userId);

    // Resolve category names → ids in one query
    const names = Array.from(new Set(data.events.map((e) => e.category)));
    const { data: cats, error: catErr } = await supabaseAdmin
      .from("sports_categories")
      .select("id, name")
      .in("name", names);
    if (catErr) throw new Error(catErr.message);
    const catMap = new Map<string, string>((cats ?? []).map((c: any) => [c.name, c.id]));

    const rows = data.events
      .map((e) => {
        const category_id = catMap.get(e.category);
        if (!category_id) return null;
        return {
          category_id,
          subcategory: e.subcategory ?? null,
          title: e.title,
          excerpt: e.time ? `${e.date ? e.date + " · " : ""}${e.time}` : (e.date ?? null),
          body: buildBody(e),
          published: false,
          created_by: userId,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    if (rows.length === 0) return { inserted: 0, skipped: data.events.length };

    const { error } = await supabaseAdmin.from("sports_blogs").insert(rows);
    if (error) throw new Error(error.message);
    return { inserted: rows.length, skipped: data.events.length - rows.length };
  });

const QueueInput = z.object({
  events: z
    .array(
      z.object({
        title: z.string().min(1).max(500),
        time: z.string().max(100).nullable().optional(),
        date: z.string().max(100).nullable().optional(),
        channels: z.array(z.string().max(200)).max(50).optional(),
        raw: z.string().max(5000).optional(),
      }),
    )
    .min(1)
    .max(500),
});

export const queueUnmatched = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => QueueInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertStaff(supabase, userId);
    const rows = data.events.map((e) => ({
      raw_text: e.raw ?? e.title,
      parsed_event: e as any,
      status: "pending",
      created_by: userId,
    }));
    const { error } = await supabaseAdmin.from("discord_import_queue").insert(rows);
    if (error) throw new Error(error.message);
    return { queued: rows.length };
  });

export const listImportQueue = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertStaff(supabase, userId);
    const { data, error } = await supabaseAdmin
      .from("discord_import_queue")
      .select("id, raw_text, parsed_event, suggested_category_id, suggested_subcategory, status, created_at")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return { items: data ?? [] };
  });

const ResolveInput = z.object({
  id: z.string().uuid(),
  action: z.enum(["import", "discard"]),
  category: z.string().max(100).optional(),
  subcategory: z.string().max(100).nullable().optional(),
  title: z.string().max(500).optional(),
});

export const resolveQueueItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ResolveInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertStaff(supabase, userId);

    const { data: item, error: getErr } = await supabaseAdmin
      .from("discord_import_queue")
      .select("id, parsed_event, status")
      .eq("id", data.id)
      .maybeSingle();
    if (getErr) throw new Error(getErr.message);
    if (!item) throw new Error("Queue item not found");
    if (item.status !== "pending") throw new Error("Already resolved");

    if (data.action === "import") {
      if (!data.category) throw new Error("Category required to import");
      const { data: cat, error: cErr } = await supabaseAdmin
        .from("sports_categories")
        .select("id")
        .eq("name", data.category)
        .maybeSingle();
      if (cErr) throw new Error(cErr.message);
      if (!cat) throw new Error("Category not found");
      const ev: any = item.parsed_event ?? {};
      const title = data.title ?? ev.title ?? "Untitled";
      const { error: insErr } = await supabaseAdmin.from("sports_blogs").insert({
        category_id: (cat as any).id,
        subcategory: data.subcategory ?? null,
        title,
        excerpt: ev.time ? `${ev.date ? ev.date + " · " : ""}${ev.time}` : (ev.date ?? null),
        body: buildBody(ev),
        published: false,
        created_by: userId,
      });
      if (insErr) throw new Error(insErr.message);
    }

    const { error: upErr } = await supabaseAdmin
      .from("discord_import_queue")
      .update({
        status: data.action === "import" ? "imported" : "discarded",
        resolved_at: new Date().toISOString(),
        resolved_by: userId,
      })
      .eq("id", data.id);
    if (upErr) throw new Error(upErr.message);

    return { ok: true };
  });

export const listCategoriesWithSubs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertStaff(supabase, userId);
    const [{ data: cats }, { data: subs }] = await Promise.all([
      supabaseAdmin.from("sports_categories").select("id, name").order("name"),
      supabaseAdmin.from("sports_subcategories").select("category_id, name, sort_order, is_default").order("sort_order"),
    ]);
    return {
      categories: cats ?? [],
      subcategories: subs ?? [],
    };
  });