import { createServerFn } from "@tanstack/react-start";
import {
  parseSportsListingBlock,
  isLikelyChannelLabel,
} from "@/lib/sports-listing-format";

/**
 * Public, unauthenticated reads of PUBLISHED sports guides for the
 * AdSense-facing /guides pages. Runs server-side with the admin client but
 * ONLY ever selects rows where published = true — drafts stay private.
 * Never returns channel info: events are reduced to date, time and title
 * before leaving the server.
 */
async function publicClient() {
  const { supabaseAdmin } = await import(
    "@/integrations/supabase/client.server"
  );
  return supabaseAdmin;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'");
}

/** Pull plain text lines out of the guide body HTML (`<div>line</div>` blocks). */
function bodyToLines(html: string): string[] {
  return decodeEntities(
    html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(div|p|li|h[1-6])>/gi, "\n")
      .replace(/<[^>]+>/g, ""),
  )
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export interface PublicGuideCategory {
  id: string;
  name: string;
  slug: string;
  sort_order: number;
  parent_id: string | null;
}

export interface PublicGuideSubcategory {
  id: string;
  category_id: string;
  name: string;
  sort_order: number;
  is_default: boolean;
}

export interface PublicGuideSummary {
  id: string;
  title: string;
  excerpt: string | null;
  created_at: string;
  updated_at: string | null;
  category_id: string;
  subcategory: string | null;
  image_url: string | null;
  badge: string | null;
}

export interface PublicGuidesData {
  categories: PublicGuideCategory[];
  subcategories: PublicGuideSubcategory[];
  guides: PublicGuideSummary[];
}

export interface PublicGuideEvent {
  date: string | null;
  time: string | null;
  title: string;
}

export interface PublicGuideDetail {
  id: string;
  title: string;
  excerpt: string | null;
  created_at: string;
  category: string;
  /** Structured listings — date, time and event name ONLY. */
  events: PublicGuideEvent[];
  /** Free-text intro/note lines that are not listings and not channels. */
  notes: string[];
}

/** Today at 00:00 in Europe/London, for dropping past events. */
function todayLondon(): Date {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "0";
  return new Date(`${get("year")}-${get("month")}-${get("day")}T00:00:00Z`);
}

/** Best-effort parse of an event date label ("Friday 31-07-26", "Fri, 9/25"). */
function parseEventDate(label: string | null): Date | null {
  if (!label) return null;
  const m = label.match(/(\d{1,2})[-/](\d{1,2})(?:[-/](\d{2,4}))?/);
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  // dd/mm when either part exceeds 12 or a 4-digit year is present; else
  // assume dd/mm (UK guides) — mm/dd only when the first part can't be a day.
  const [day, month] = a > 12 ? [a, b] : b > 12 ? [b, a] : [a, b];
  let year = m[3] ? Number(m[3]) : todayLondon().getUTCFullYear();
  if (year < 100) year += 2000;
  const d = new Date(Date.UTC(year, month - 1, day));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** True when every parseable event date is before today (London). */
function guideIsExpired(html: string): boolean {
  const parsed = parseSportsListingBlock(bodyToLines(html).join("\n"));
  if (!parsed.length) return false;
  const today = todayLondon();
  let sawDate = false;
  for (const e of parsed) {
    const d = parseEventDate(e.date ?? null);
    if (!d) continue;
    sawDate = true;
    if (d >= today) return false;
  }
  // No parseable dates → can't prove it's old, keep it.
  return sawDate;
}

export const listPublicGuides = createServerFn({ method: "GET" }).handler(
  async (): Promise<PublicGuidesData> => {
    const supabase = await publicClient();
    const [
      { data: blogs, error: blogsError },
      { data: categories },
      { data: subcategories },
    ] = await Promise.all([
      supabase
        .from("sports_blogs")
        .select(
          "id, title, excerpt, created_at, updated_at, category_id, subcategory, image_url, badge, body, archived_body",
        )
        .eq("published", true)
        .order("sort_order")
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("sports_categories")
        .select("id, name, slug, sort_order, parent_id")
        .order("sort_order"),
      supabase
        .from("sports_subcategories")
        .select("id, category_id, name, sort_order, is_default")
        .order("sort_order"),
    ]);
    if (blogsError) throw new Error(blogsError.message);
    // Only guides with a live body: an empty body means the 10h sweep has
    // archived it, i.e. every event has already happened. Belt-and-braces:
    // also drop any guide whose parseable event dates are all in the past.
    const guides = (blogs ?? [])
      .filter((b) => (b.body ?? "").trim().length > 0)
      .filter((b) => !guideIsExpired(b.body ?? ""))
      .map((b) => ({
        id: b.id,
        title: b.title,
        excerpt: b.excerpt,
        created_at: b.created_at,
        updated_at: b.updated_at ?? null,
        category_id: b.category_id,
        subcategory: b.subcategory ?? null,
        image_url: b.image_url ?? null,
        badge: b.badge ?? null,
      }));
    return {
      categories: (categories ?? []) as PublicGuideCategory[],
      subcategories: (subcategories ?? []) as PublicGuideSubcategory[],
      guides,
    };
  },
);

export const getPublicGuide = createServerFn({ method: "GET" })
  .inputValidator((id: string) => {
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Invalid guide id");
    return id;
  })
  .handler(async ({ data: id }): Promise<PublicGuideDetail | null> => {
    const supabase = await publicClient();
    const { data: blog, error } = await supabase
      .from("sports_blogs")
      .select("id, title, excerpt, body, archived_body, created_at, category_id")
      .eq("id", id)
      .eq("published", true)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!blog) return null;

    let category = "Sports";
    const { data: cat } = await supabase
      .from("sports_categories")
      .select("name")
      .eq("id", blog.category_id)
      .maybeSingle();
    if (cat?.name) category = cat.name;

    // Live body only: an empty body means the 10h sweep archived it because
    // every event has already happened — treat the guide as expired.
    if (!blog.body?.trim()) return null;
    const lines = bodyToLines(blog.body);
    const parsed = parseSportsListingBlock(lines.join("\n"));
    // Channel info is members-only: keep date, time and event name only.
    // Drop events whose date is already past (London).
    const today = todayLondon();
    const events: PublicGuideEvent[] = parsed
      .filter((e) => {
        const d = parseEventDate(e.date ?? null);
        return !d || d >= today;
      })
      .map((e) => ({
        date: e.date ?? null,
        time: e.time ?? null,
        title: e.title,
      }));

    // Non-listing lines (intro text, notes) are shown as long as they are
    // not channel labels.
    const eventLines = new Set(
      events.map((e) => e.title.trim().toLowerCase()),
    );
    const notes = lines.filter((line) => {
      if (isLikelyChannelLabel(line)) return false;
      if (eventLines.has(line.toLowerCase())) return false;
      if (events.length && /^\d{1,2}:\d{2}/.test(line)) return false;
      // Fixture-style lines ("A vs B", "A v B", "A & B") are listings, not notes.
      if (events.length && /\s(?:vs?\.?|&|@)\s/i.test(line)) return false;
      // Bare date headings ("Friday 31-07-26", "Sat 12 Aug") are listings too.
      if (events.length && /^(mon|tue|wed|thu|fri|sat|sun)/i.test(line)) return false;
      return true;
    });

    return {
      id: blog.id,
      title: blog.title,
      excerpt: blog.excerpt,
      created_at: blog.created_at,
      category,
      events,
      notes: notes.slice(0, 20),
    };
  });
