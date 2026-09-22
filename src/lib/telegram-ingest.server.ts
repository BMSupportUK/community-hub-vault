import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { routeEvent } from "./discord-sport-keywords";

// ── Telegram → Sports Guide import queue ──────────────────────────
// Server-only module (called from the Telegram webhook route and from
// admin server functions). Splits forwarded listing posts into events
// with the same AI splitter + keyword router the paste importer uses.

type ParsedEvent = {
  title: string;
  time: string | null;
  date: string | null;
  channels: string[];
  raw: string;
  aiCategory?: string | null;
  aiSubcategory?: string | null;
};

function buildSystemPrompt(taxonomy: string[]): string {
  return `You extract individual sports broadcast events from raw Telegram channel/group text.

Each event has:
- title: the sport / match / fixture name (e.g. "Manchester United vs Liverpool", "UFC 300", "IPL: Mumbai vs Chennai", "Greyhound Racing - Romford")
- time: kickoff/start time as written (e.g. "19:45 GMT", "2:30pm UK", "9:30am ET") or null
- date: date as written (e.g. "Saturday 1 January 2026") or null if not present
- channels: array of broadcast channels/streams listed for that event (e.g. ["Sky Sports Main Event", "TNT Sports 1"]) — empty array if none
- category: the single best-fit LEAF category from this exact list (lines show "Heading › Leaf" when grouped, plus any sub-lists in brackets). Output ONLY the leaf name itself (e.g. "Mens", "Boxing, MMA & UFC"), or null if none fit:
${taxonomy.map((t) => `  - ${t}`).join("\n")}
- subcategory: one of the sub-lists shown in brackets for the chosen leaf, or null
- raw: the verbatim chunk of original text this event came from

Rules:
- One object per event/fixture. If a message lists 5 matches, return 5 objects.
- Ignore decorative dividers, emojis, role pings, "auto-deletes in 24h" notices, "posted by" lines.
- If the same date/header applies to multiple events below it, copy that date onto each event.
- Club fixtures belong in the leaf under the matching sport heading (e.g. an English league match → the "Football › Mens" leaf); internationals (country vs country) → the international leaf when one exists.
- Combat sports (UFC, MMA, boxing events and fight cards) belong in the combat-sports leaf (e.g. "Boxing, MMA & UFC").
- Output STRICT JSON: { "events": [ ... ] }. No prose, no markdown fences.`;
}

async function splitWithAI(text: string, taxonomy: string[]): Promise<ParsedEvent[]> {
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
        { role: "system", content: buildSystemPrompt(taxonomy) },
        { role: "user", content: text },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (res.status === 429) throw new Error("AI rate-limited. Try again in a moment.");
  if (res.status === 402) throw new Error("AI credits exhausted. Add credits in Workspace settings.");
  if (!res.ok) throw new Error(`AI service error (${res.status})`);

  const json = await res.json();
  const content: unknown = json?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content) throw new Error("AI returned empty response");

  let parsed: any;
  try {
    parsed = JSON.parse(content);
  } catch {
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
      aiCategory: e?.category ? String(e.category).trim() : null,
      aiSubcategory: e?.subcategory ? String(e.subcategory).trim() : null,
    }))
    .filter((e: ParsedEvent) => e.title.length > 0);
}

// The keyword router predates the grouped categories, so some of its
// category names no longer exist. Map the stale names onto current ones.
const CATEGORY_RENAMES: Record<string, string> = {
  "UFC": "Boxing, MMA & UFC",
  "Boxing": "Boxing, MMA & UFC",
  "Football | Mens": "Mens",
  "Football | Mens International": "Mens International",
  "Football | Women": "Women",
  "Football | Womens International": "Womens International",
  "Daily Sports & PPV": "Daily Sports & PPV Events",
};

export async function ingestTelegramPost(opts: {
  text: string;
  sourceRef: string;
  forwardedFrom: string | null;
}): Promise<{ queued: number }> {
  // Build the leaf-category taxonomy ("Heading › Leaf — subs: a, b") for the AI.
  // Headings (categories that have children) are never import targets.
  const [{ data: cats }, { data: subs }] = await Promise.all([
    supabaseAdmin.from("sports_categories").select("id, name, parent_id"),
    supabaseAdmin.from("sports_subcategories").select("category_id, name"),
  ]);
  const catNameById = new Map((cats ?? []).map((c: any) => [c.id, c.name]));
  const headingIds = new Set((cats ?? []).map((c: any) => c.parent_id).filter(Boolean));
  const leaves = (cats ?? []).filter((c: any) => !headingIds.has(c.id));

  const validSubs = new Map<string, Set<string>>();
  for (const s of subs ?? []) {
    if (!validSubs.has(s.category_id)) validSubs.set(s.category_id, new Set());
    validSubs.get(s.category_id)!.add(s.name);
  }

  const taxonomy: string[] = leaves.map((c: any) => {
    const heading = c.parent_id ? `${catNameById.get(c.parent_id)} › ` : "";
    const subList = validSubs.get(c.id);
    const subNote = subList && subList.size ? ` — subs: ${Array.from(subList).join(", ")}` : "";
    return `${heading}${c.name}${subNote}`;
  });
  const validCats = new Map<string, string>(); // leaf name -> leaf id
  for (const c of leaves) validCats.set(c.name, c.id);
  const validSubsByCat = new Map<string, Set<string>>();
  for (const c of leaves) {
    const s = validSubs.get(c.id);
    if (s) validSubsByCat.set(c.name, s);
  }

  const events = await splitWithAI(opts.text, taxonomy);
  if (events.length === 0) return { queued: 0 };

  const rows = events.map((ev) => {
    // Keyword router wins when it names a real current leaf category;
    // otherwise fall back to the AI's pick from the taxonomy.
    const m = routeEvent(`${ev.title} ${ev.channels.join(" ")}`);
    let category: string | null = null;
    let subcategory: string | null = null;
    if (m && !validCats.has(m.category) && CATEGORY_RENAMES[m.category]) {
      m.category = CATEGORY_RENAMES[m.category];
    }
    if (m && validCats.has(m.category)) {
      category = m.category;
      if (m.subcategory && validSubsByCat.get(category)?.has(m.subcategory)) {
        subcategory = m.subcategory;
      }
    }
    if (!category && ev.aiCategory && validCats.has(ev.aiCategory)) {
      category = ev.aiCategory;
      if (ev.aiSubcategory && validSubsByCat.get(category)?.has(ev.aiSubcategory)) {
        subcategory = ev.aiSubcategory;
      }
    }
    return {
      raw_text: ev.raw || ev.title,
      parsed_event: { ...ev, suggested_category: category, suggested_subcategory: subcategory } as any,
      suggested_subcategory: subcategory,
      status: "pending",
      source: "telegram",
      source_ref: `${opts.sourceRef}:${ev.title}`.slice(0, 400),
      forwarded_from: opts.forwardedFrom,
      // suggested_category_id expects a uuid; our router returns category
      // names, so leave it null and surface the guess via parsed_event.
    };
  });

  // Skip events we've already queued from a previous delivery of this post
  // (the partial unique index on source_ref can't drive upsert conflicts).
  const refs = rows.map((r) => r.source_ref);
  const { data: existing, error: selErr } = await supabaseAdmin
    .from("discord_import_queue")
    .select("source_ref")
    .in("source_ref", refs);
  if (selErr) throw new Error(selErr.message);
  const seen = new Set((existing ?? []).map((r: any) => r.source_ref));
  const fresh = rows.filter((r) => !seen.has(r.source_ref));
  if (fresh.length === 0) return { queued: 0 };

  const { error } = await supabaseAdmin.from("discord_import_queue").insert(fresh as any);
  if (error) throw new Error(error.message);
  return { queued: fresh.length };
}

/** Who is allowed to feed the bot. First sender is auto-registered. */
export async function isAllowedTelegramSender(
  telegramUserId: number,
  username: string | null,
): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("telegram_sports_sources")
    .select("telegram_user_id");
  if (error) throw new Error(error.message);

  const rows = data ?? [];
  if (rows.length === 0) {
    // Nobody registered yet — the first person to message the bot becomes
    // the owner-feeder (this is the person who just set the bot up).
    await supabaseAdmin
      .from("telegram_sports_sources")
      .insert({ telegram_user_id: telegramUserId, telegram_username: username });
    return true;
  }
  return rows.some((r: any) => Number(r.telegram_user_id) === telegramUserId);
}

export async function listTelegramSenders() {
  const { data, error } = await supabaseAdmin
    .from("telegram_sports_sources")
    .select("telegram_user_id, telegram_username, label, created_at")
    .order("created_at");
  if (error) throw new Error(error.message);
  return data ?? [];
}
