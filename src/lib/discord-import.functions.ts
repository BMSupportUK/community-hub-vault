import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { routeEvent } from "./discord-sport-keywords";
import {
  formatSportsListingBlock,
  mergeSportsListingBlocks,
  parseSportsListingBlock,
  plainListingToHtml,
  sortSportsListingEvents,
  splitListingSections,
  headlineListingDate,
  listingBlockHasDate,
} from "./sports-listing-format";

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

// ── Discord bot one-time setup ────────────────────────────────────
// Staff-only. Registers the "Send to Sports Guide" message context-menu
// command on the user's own Discord application and points Discord's
// interaction webhook at this app. Safe to re-run (Discord upserts by name).

const DISCORD_API = "https://discord.com/api/v10";

export const setupDiscordBot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertStaff(supabase, userId);

    const token = process.env.DISCORD_BOT_TOKEN?.trim();
    if (!token) throw new Error("DISCORD_BOT_TOKEN is not saved yet");
    if (!process.env.DISCORD_APP_PUBLIC_KEY?.trim()) throw new Error("DISCORD_APP_PUBLIC_KEY is not saved yet");

    const headers = { Authorization: `Bot ${token}`, "Content-Type": "application/json" };

    // Point Discord at our interactions endpoint. The preview address serves
    // the latest build; after publishing, re-run setup to switch Discord to
    // the published address.
    const endpointUrl = "https://project--5e1fe153-4c10-4ade-8c98-e355fcdea791-dev.lovable.app/api/public/discord/interactions";
    const patch = await fetch(`${DISCORD_API}/applications/@me`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ interactions_endpoint_url: endpointUrl }),
    });
    if (!patch.ok) {
      const t = await patch.text();
      throw new Error(`Couldn't set the interactions URL (${patch.status}): ${t.slice(0, 200)}`);
    }
    const app: any = await patch.json();

    // Register the global message context-menu command (type 3 = message).
    const reg = await fetch(`${DISCORD_API}/applications/${app.id}/commands`, {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "Send to Sports Guide", type: 3 }),
    });
    if (!reg.ok && reg.status !== 409) {
      const t = await reg.text();
      throw new Error(`Couldn't register the command (${reg.status}): ${t.slice(0, 200)}`);
    }

    return { ok: true, application: app.name ?? app.id, endpointUrl };
  });

export const getDiscordStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context.supabase, context.userId);
    const token = process.env.DISCORD_BOT_TOKEN?.trim();
    if (!token) return { connected: false, application: null as string | null };
    try {
      const r = await fetch(`${DISCORD_API}/applications/@me`, { headers: { Authorization: `Bot ${token}` } });
      if (!r.ok) return { connected: false, application: null as string | null };
      const app: any = await r.json();
      const connected = typeof app.interactions_endpoint_url === "string" && app.interactions_endpoint_url.includes("/api/public/discord/interactions");
      return { connected, application: (app.name ?? app.id ?? null) as string | null };
    } catch {
      return { connected: false, application: null as string | null };
    }
  });

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

function buildBody(ev: { time?: string | null; date?: string | null; channels?: string[]; raw?: string }, sourceZone?: "gmt" | "et" | null) {
  // Flosports (Flo College, Flo Racing…) always publishes in US Eastern time.
  const zone = sourceZone ?? (/\bflo\s?(?:college|racing|sports|football|hockey|wrestling)\b/i.test(ev.raw ?? "") ? "et" : null);
  const formatted = formatSportsListingBlock({
    raw: ev.raw,
    date: ev.date,
    time: ev.time,
    channels: ev.channels,
    sourceZone: zone,
  });
  if (formatted) return formatted;

  const parts: string[] = [];
  if (ev.date) parts.push(ev.date);
  if (ev.time) parts.push(ev.time);
  if (ev.raw) parts.push(ev.raw);
  if (ev.channels && ev.channels.length) parts.push(ev.channels.join(" • "));
  return parts.join("\n");
}

// ── Auto cover illustration ───────────────────────────────────────
// Generates ONE digital illustration per (category, subcategory) and
// caches the public URL so subsequent imports reuse the same cover.

async function generateCoverImage(prompt: string): Promise<Uint8Array | null> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-image",
        messages: [
          {
            role: "user",
            content: `Wide 1600x600 digital illustration cover header for a sports guide about ${prompt}. Modern flat vector illustration style, bold dynamic composition, energetic colors, clean shapes, no text, no logos, no watermarks.`,
          },
        ],
        modalities: ["image", "text"],
      }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const dataUrl: string | undefined = json?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!dataUrl) return null;
    const b64 = dataUrl.split(",")[1];
    if (!b64) return null;
    return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

async function ensureSportCover(categoryId: string, categoryName: string, subcategory: string | null): Promise<string | null> {
  const subKey = subcategory ?? "";
  // 1. Cache lookup
  const { data: cached } = await supabaseAdmin
    .from("sport_cover_cache")
    .select("image_url")
    .eq("category_id", categoryId)
    .eq("subcategory", subKey)
    .maybeSingle();
  if (cached?.image_url) return cached.image_url;

  // 2. Generate
  const prompt = subcategory ? `${categoryName} — ${subcategory}` : categoryName;
  const bytes = await generateCoverImage(prompt);
  if (!bytes) return null;

  // 3. Upload to public bucket
  const slug = `${categoryId}/${(subKey || "default").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}-${Date.now()}.png`;
  const path = `auto/${slug}`;
  const { error: upErr } = await supabaseAdmin.storage
    .from("sports-guide-covers")
    .upload(path, bytes, { contentType: "image/png", upsert: false });
  if (upErr) return null;
  const { data: pub } = supabaseAdmin.storage.from("sports-guide-covers").getPublicUrl(path);
  const url = pub.publicUrl;

  // 4. Cache
  await supabaseAdmin
    .from("sport_cover_cache")
    .insert({ category_id: categoryId, subcategory: subKey, image_url: url });

  return url;
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

    // Resolve / generate one cover per unique (category, subcategory) pair
    const coverKeys = new Map<string, { catId: string; catName: string; sub: string | null }>();
    for (const e of data.events) {
      const catId = catMap.get(e.category);
      if (!catId) continue;
      const sub = e.subcategory ?? null;
      const key = `${catId}::${sub ?? ""}`;
      if (!coverKeys.has(key)) coverKeys.set(key, { catId, catName: e.category, sub });
    }
    const coverEntries = await Promise.all(
      Array.from(coverKeys.entries()).map(async ([key, v]) => {
        const url = await ensureSportCover(v.catId, v.catName, v.sub);
        return [key, url] as const;
      }),
    );
    const coverMap = new Map(coverEntries);

    const rows = data.events
      .map((e) => {
        const category_id = catMap.get(e.category);
        if (!category_id) return null;
        const coverKey = `${category_id}::${e.subcategory ?? ""}`;
        return {
          category_id,
          subcategory: e.subcategory ?? null,
          title: e.title,
          excerpt: e.time ? `${e.date ? e.date + " · " : ""}${e.time}` : (e.date ?? null),
          body: plainListingToHtml(buildBody(e)),
          image_url: coverMap.get(coverKey) ?? null,
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

/** First meaningful line of a post, used as the queue item's heading. */
function postHeading(text: string): string {
  const line = text
    .split("\n")
    .map((l) => l.replace(/[*_`#>]+/g, "").trim())
    .find((l) => l.replace(/[^A-Za-z0-9]/g, "").length > 1);
  return (line || "Pasted listing").slice(0, 300);
}

/** Queue one review item per named listing section in a pasted post. */
export const queuePastedPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ text: z.string().min(1).max(50_000) }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertStaff(supabase, userId);
    const text = data.text.trim();
    if (!text) throw new Error("Nothing to queue");
    // Never auto-split: a pasted post arrives as ONE pending import. Staff
    // decide whether to split it, in the importer.
    const blocks = [{ title: postHeading(text), raw: text }];
    const sourceRef = `paste:${userId}:${Date.now()}`;
    const rows = blocks.map((block, index) => ({
      raw_text: block.raw,
      parsed_event: {
        title: block.title,
        time: null,
        date: null,
        channels: [],
        raw: block.raw,
        suggested_category: null,
        suggested_subcategory: null,
      } as any,
      status: "pending",
      source: "paste",
      source_ref: blocks.length > 1 ? `${sourceRef}#${index + 1}` : sourceRef,
      created_by: userId,
    }));
    const { error } = await supabaseAdmin.from("discord_import_queue").insert(rows as any);
    if (error) throw new Error(error.message);
    return { queued: rows.length };
  });

/**
 * Splits one queued post into a separate queue item per event, so a
 * multi-sport listing can be filed into a different guide per event.
 * The original post is removed from the queue once split.
 */
export const splitQueueItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertStaff(supabase, userId);

    const { data: item, error: getErr } = await supabaseAdmin
      .from("discord_import_queue")
      .select("id, raw_text, parsed_event, status, source, source_ref, forwarded_from")
      .eq("id", data.id)
      .maybeSingle();
    if (getErr) throw new Error(getErr.message);
    if (!item) throw new Error("Queue item not found");
    if (item.status !== "pending") throw new Error("Already resolved");

    const raw = String((item.parsed_event as any)?.raw ?? item.raw_text ?? "");
    const headDate = headlineListingDate(raw);
    const events = sortSportsListingEvents(parseSportsListingBlock(raw)).map((e) => ({ ...e, date: e.date || headDate }));
    if (!events.length) throw new Error("Couldn't read any events in this post");

    const rows = events.map((e, i) => ({
      raw_text: [e.date, [e.time, e.title].filter(Boolean).join(" "), e.channels.join(" • ")]
        .filter(Boolean)
        .join("\n"),
      parsed_event: {
        title: e.title,
        time: e.time || null,
        date: e.date || null,
        channels: e.channels,
        raw: [e.date, [e.time, e.title].filter(Boolean).join(" "), e.channels.join(" • ")]
          .filter(Boolean)
          .join("\n"),
        suggested_category: null,
        suggested_subcategory: null,
      } as any,
      status: "pending",
      source: item.source ?? "paste",
      source_ref: `${item.source_ref ?? `split:${item.id}`}#${i + 1}`,
      forwarded_from: item.forwarded_from ?? null,
      created_by: userId,
    }));

    const { error: insErr } = await supabaseAdmin.from("discord_import_queue").insert(rows as any);
    if (insErr) throw new Error(insErr.message);

    const { error: delErr } = await supabaseAdmin
      .from("discord_import_queue")
      .update({ status: "discarded" } as any)
      .eq("id", item.id);
    if (delErr) throw new Error(delErr.message);

    return { created: rows.length };
  });

// One pasted post can hold several providers ("MONOMAX" then "STAN Sport"),
// each of which has its own guide. Split it into one queue item per provider
// so each block can be filed against the right guide.
export const splitQueueItemByProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertStaff(supabase, userId);

    const { data: item, error: getErr } = await supabaseAdmin
      .from("discord_import_queue")
      .select("id, raw_text, parsed_event, status, source, source_ref, forwarded_from")
      .eq("id", data.id)
      .maybeSingle();
    if (getErr) throw new Error(getErr.message);
    if (!item) throw new Error("Queue item not found");
    if (item.status !== "pending") throw new Error("Already resolved");

    const raw = String((item.parsed_event as any)?.raw ?? item.raw_text ?? "");
    const sections = splitListingSections(raw);
    if (sections.length < 2) throw new Error("Only one listing name found in this post");

    const headDate = headlineListingDate(raw);
    const rows = sections.map((section, i) => {
      const sectionRaw = headDate && !listingBlockHasDate(section.raw)
        ? `${headDate}\n${section.raw.trim()}`
        : section.raw.trim();
      const events = sortSportsListingEvents(parseSportsListingBlock(sectionRaw));
      const first = events[0];
      const body = `${section.name}\n${sectionRaw}`;
      return {
        raw_text: body,
        parsed_event: {
          title: section.name,
          time: first?.time ?? null,
          date: first?.date ?? null,
          channels: [],
          raw: body,
          suggested_category: null,
          suggested_subcategory: null,
        } as any,
        status: "pending",
        source: item.source ?? "paste",
        source_ref: `${item.source_ref ?? `provider:${item.id}`}#${i + 1}`,
        forwarded_from: item.forwarded_from ?? null,
        created_by: userId,
      };
    });

    const { error: insErr } = await supabaseAdmin.from("discord_import_queue").insert(rows as any);
    if (insErr) throw new Error(insErr.message);

    const { error: delErr } = await supabaseAdmin
      .from("discord_import_queue")
      .update({ status: "discarded" } as any)
      .eq("id", item.id);
    if (delErr) throw new Error(delErr.message);

    return { created: rows.length };
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
      .select("id, raw_text, parsed_event, suggested_category_id, suggested_subcategory, status, created_at, source, forwarded_from")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return { items: data ?? [] };
  });

export const deleteQueueItems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ ids: z.array(z.string().uuid()).min(1).max(500) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertStaff(supabase, userId);
    const { error, count } = await supabaseAdmin
      .from("discord_import_queue")
      .delete({ count: "exact" })
      .in("id", data.ids)
      .eq("status", "pending");
    if (error) throw new Error(error.message);
    return { deleted: count ?? 0 };
  });

const ResolveInput = z.object({
  id: z.string().uuid(),
  action: z.enum(["import", "discard"]),
  category: z.string().max(100).optional(),
  subcategory: z.string().max(100).nullable().optional(),
  /** Post the same listing under several subcategories at once. */
  subcategories: z.array(z.string().max(100)).max(100).optional(),
  title: z.string().max(500).optional(),
  guideId: z.string().uuid().optional(),
  /** Staff-confirmed kick-off time, e.g. "19:45 GMT · 14:45 EDT". */
  time: z.string().max(100).nullable().optional(),
  /** Which zone bare start times in the raw post belong to. */
  sourceZone: z.enum(["gmt", "et"]).optional(),
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

    const guideIds: string[] = [];

    if (data.action === "import") {
      if (!data.category) throw new Error("Category required to import");
      const { data: cat, error: cErr } = await supabaseAdmin
        .from("sports_categories")
        .select("id")
        .eq("name", data.category)
        .maybeSingle();
      if (cErr) throw new Error(cErr.message);
      if (!cat) throw new Error("Category not found");
      const ev: any = { ...((item.parsed_event ?? {}) as Record<string, unknown>) };
      if (data.time !== undefined) ev.time = data.time;
      const title = data.title ?? ev.title ?? "Untitled";
      const importedBody = buildBody(ev, data.sourceZone ?? null);
      if (data.guideId) {
        const { data: guide, error: guideErr } = await supabaseAdmin
          .from("sports_blogs")
          .select("id, category_id, body")
          .eq("id", data.guideId)
          .eq("category_id", (cat as any).id)
          .maybeSingle();
        if (guideErr) throw new Error(guideErr.message);
        if (!guide) throw new Error("That guide is not in the selected category");
        const existingBody = String((guide as any).body ?? "").trim();
        const sortedBody = mergeSportsListingBlocks(existingBody, importedBody, {
          date: ev.date,
          time: ev.time,
          channels: ev.channels,
          sourceZone: data.sourceZone ?? null,
        });
        const safeBody = plainListingToHtml(sortedBody ?? [existingBody, importedBody].filter(Boolean).join("\n\n"));
        const { error: updateErr } = await supabaseAdmin
          .from("sports_blogs")
          .update({
            body: safeBody,
            published: false,
            updated_at: new Date().toISOString(),
          })
          .eq("id", data.guideId);
        if (updateErr) throw new Error(updateErr.message);
        guideIds.push(data.guideId);
      } else {
      // One draft per chosen subcategory (none chosen → a single draft
      // straight under the category).
      const chosenSubs: (string | null)[] =
        data.subcategories && data.subcategories.length > 0
          ? Array.from(new Set(data.subcategories))
          : [data.subcategory ?? null];
      const rows = await Promise.all(
        chosenSubs.map(async (sub) => ({
          category_id: (cat as any).id,
          subcategory: sub,
          title,
          excerpt: ev.time ? `${ev.date ? ev.date + " · " : ""}${ev.time}` : (ev.date ?? null),
          body: plainListingToHtml(buildBody(ev, data.sourceZone ?? null)),
          image_url: await ensureSportCover((cat as any).id, data.category!, sub),
          published: false,
          created_by: userId,
        })),
      );
       const { data: inserted, error: insErr } = await supabaseAdmin
         .from("sports_blogs")
         .insert(rows)
         .select("id");
      if (insErr) throw new Error(insErr.message);
       guideIds.push(...(inserted ?? []).map((row: { id: string }) => row.id));
      }
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

    return { ok: true, guideIds };
  });

/**
 * Imports every pending queue item that has an AI category suggestion,
 * using the suggested category/subcategory. Items without a suggestion
 * stay pending for manual review.
 */
export const approveAllSuggested = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertStaff(supabase, userId);

    const { data: items, error } = await supabaseAdmin
      .from("discord_import_queue")
      .select("id, parsed_event")
      .eq("status", "pending")
      .limit(500);
    if (error) throw new Error(error.message);

    const ready = (items ?? []).filter((it: any) => it.parsed_event?.suggested_category);
    if (ready.length === 0) return { imported: 0, skipped: (items ?? []).length };

    const names = Array.from(new Set(ready.map((it: any) => String(it.parsed_event.suggested_category))));
    const { data: cats, error: catErr } = await supabaseAdmin
      .from("sports_categories")
      .select("id, name")
      .in("name", names);
    if (catErr) throw new Error(catErr.message);
    const catMap = new Map<string, string>((cats ?? []).map((c: any) => [c.name, c.id]));

    let imported = 0;
    for (const it of ready as any[]) {
      const ev = it.parsed_event ?? {};
      const catId = catMap.get(String(ev.suggested_category));
      if (!catId) continue;
      const sub = ev.suggested_subcategory ?? null;
      try {
        const coverUrl = await ensureSportCover(catId, String(ev.suggested_category), sub);
        const { error: insErr } = await supabaseAdmin.from("sports_blogs").insert({
          category_id: catId,
          subcategory: sub,
          title: ev.title ?? "Untitled",
          excerpt: ev.time ? `${ev.date ? ev.date + " · " : ""}${ev.time}` : (ev.date ?? null),
          body: plainListingToHtml(buildBody(ev)),
          image_url: coverUrl,
          published: false,
          created_by: userId,
        });
        if (insErr) continue;
        await supabaseAdmin
          .from("discord_import_queue")
          .update({ status: "imported", resolved_at: new Date().toISOString(), resolved_by: userId })
          .eq("id", it.id);
        imported++;
      } catch {
        // Leave failed rows pending for manual handling.
      }
    }

    return { imported, skipped: (items ?? []).length - imported };
  });

export const listCategoriesWithSubs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertStaff(supabase, userId);
    const [{ data: cats }, { data: subs }] = await Promise.all([
      supabaseAdmin.from("sports_categories").select("id, name, parent_id, sort_order").order("sort_order"),
      supabaseAdmin.from("sports_subcategories").select("category_id, name, sort_order, is_default").order("sort_order"),
    ]);
    return {
      categories: cats ?? [],
      subcategories: subs ?? [],
    };
  });
/**
 * Existing sports guide names inside a category, so staff can post a
 * listing under a guide they already use instead of typing a new name.
 */
export const listGuidesInCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    category: z.string().max(100),
    subcategory: z.string().max(100).nullable().optional(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertStaff(supabase, userId);
    const { data: cat } = await supabaseAdmin
      .from("sports_categories")
      .select("id")
      .eq("name", data.category)
      .maybeSingle();
    if (!cat) return { guides: [] as { title: string; subcategory: string | null }[] };
    let query = supabaseAdmin
      .from("sports_blogs")
      .select("id, title, subcategory, created_at")
      .eq("category_id", (cat as any).id)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false })
      .limit(300);
    if (data.subcategory) query = query.eq("subcategory", data.subcategory);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    const seen = new Set<string>();
    const guides: { id: string; title: string; subcategory: string | null }[] = [];
    for (const r of (rows ?? []) as any[]) {
      const key = `${r.title}::${r.subcategory ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      guides.push({ id: r.id, title: r.title, subcategory: r.subcategory ?? null });
    }
    return { guides };
  });

/**
 * Merge several pending queue posts (e.g. an ESPN+ listing that Discord
 * delivered as two messages) into one import. Posts are joined oldest first
 * so an event name at the end of one message stays directly above the time
 * line that opens the next message.
 */
export const combineQueueItems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        ids: z.array(z.string().uuid()).min(2).max(200),
        title: z.string().trim().min(1).max(120).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertStaff(supabase, userId);
    const { data: rows, error } = await supabaseAdmin
      .from("discord_import_queue")
      .select("id, raw_text, parsed_event, created_at, source_ref")
      .in("id", data.ids)
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .order("source_ref", { ascending: true });
    if (error) throw new Error(error.message);
    const items = rows ?? [];
    if (items.length < 2) throw new Error("Need at least two pending listings to combine");
    const texts = items.map((r: any) => String(r.parsed_event?.raw ?? r.raw_text ?? "").replace(/\s+$/, ""));
    const heading = (texts[0].split("\n").find((l) => l.trim()) ?? "").trim();
    const merged = texts
      .map((t, i) => {
        if (i === 0 || !heading) return t;
        const lines = t.split("\n");
        const idx = lines.findIndex((l) => l.trim());
        if (idx >= 0 && lines[idx].trim() === heading) lines.splice(idx, 1);
        return lines.join("\n").replace(/^\s*\n/, "");
      })
      .join("\n")
      .slice(0, 50_000);
    const first: any = items[0];
    const { error: upErr } = await supabaseAdmin
      .from("discord_import_queue")
      .update({
        raw_text: merged,
        parsed_event: { ...(first.parsed_event ?? {}), raw: merged, title: data.title ?? "ESPN+" },
      } as any)
      .eq("id", first.id);
    if (upErr) throw new Error(upErr.message);
    const rest = items.slice(1).map((r: any) => r.id);
    const { error: delErr } = await supabaseAdmin.from("discord_import_queue").delete().in("id", rest);
    if (delErr) throw new Error(delErr.message);
    return { combined: items.length, id: first.id };
  });

// ── Mergeable channel names (Merge Listings button) ───────────────
// Staff-configurable list of channel/provider names whose split queue
// posts can be joined back into a single import. Stored in app_settings
// under the "merge_channels" key: { channels: string[] }.

const MERGE_CHANNELS_KEY = "merge_channels";

export const getMergeChannels = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertStaff(supabase, userId);
    const { data, error } = await supabaseAdmin
      .from("app_settings")
      .select("value")
      .eq("key", MERGE_CHANNELS_KEY)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const channels = Array.isArray((data as any)?.value?.channels)
      ? (data as any).value.channels.map((c: unknown) => String(c)).filter((c: string) => c.trim())
      : [];
    return { channels };
  });

export const saveMergeChannels = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ channels: z.array(z.string().trim().min(1).max(60)).max(50) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertStaff(supabase, userId);
    const seen = new Set<string>();
    const channels = data.channels.filter((c) => {
      const k = c.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    const { error } = await supabaseAdmin
      .from("app_settings")
      .upsert({ key: MERGE_CHANNELS_KEY, value: { channels }, updated_at: new Date().toISOString() } as any);
    if (error) throw new Error(error.message);
    return { channels };
  });
