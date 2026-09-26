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

export interface PublicGuideSummary {
  id: string;
  title: string;
  excerpt: string | null;
  created_at: string;
  category_id: string;
  category: string;
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

export const listPublicGuides = createServerFn({ method: "GET" }).handler(
  async (): Promise<PublicGuideSummary[]> => {
    const supabase = await publicClient();
    const [{ data: blogs, error: blogsError }, { data: categories }] =
      await Promise.all([
        supabase
          .from("sports_blogs")
          .select("id, title, excerpt, created_at, category_id")
          .eq("published", true)
          .order("created_at", { ascending: false })
          .limit(100),
        supabase.from("sports_categories").select("id, name"),
      ]);
    if (blogsError) throw new Error(blogsError.message);
    const categoryNames = new Map(
      (categories ?? []).map((c) => [c.id, c.name] as const),
    );
    return (blogs ?? []).map((b) => ({
      id: b.id,
      title: b.title,
      excerpt: b.excerpt,
      created_at: b.created_at,
      category_id: b.category_id,
      category: categoryNames.get(b.category_id) ?? "Sports",
    }));
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
      .select("id, title, excerpt, body, created_at, category_id")
      .eq("id", id)
      .eq("published", true)
      .maybeSingle();
    console.error("[getPublicGuide]", id, "error:", error?.message, "found:", !!blog);
    if (error) throw new Error(error.message);
    if (!blog) return null;

    let category = "Sports";
    const { data: cat } = await supabase
      .from("sports_categories")
      .select("name")
      .eq("id", blog.category_id)
      .maybeSingle();
    if (cat?.name) category = cat.name;

    const lines = bodyToLines(blog.body ?? "");
    const parsed = parseSportsListingBlock(lines.join("\n"));
    // Channel info is members-only: keep date, time and event name only.
    const events: PublicGuideEvent[] = parsed.map((e) => ({
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
