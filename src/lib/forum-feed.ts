import { supabase } from "@/integrations/supabase/client";

export const FORUM_FEED_PAGE_SIZE = 20;

/** Automated match-day bot — its posts are hidden from the New Content feeds. */
const BORO_MATCHDAY_ACTION_AUTHOR_ID = "91304401-78e5-4907-803e-34da8008a0a4";

export type ForumFeedPost = {
  id: string;
  body: string;
  created_at: string;
  is_op: boolean;
  topic_id: string;
  topic_title: string;
  board_slug: string;
  board_name: string;
  author_id: string;
  author_alias: string;
  author_avatar: string | null;
};

const YOUTUBE_RE = /(?:youtube(?:-nocookie)?\.com|youtu\.be)/i;
const VIMEO_RE = /vimeo\.com/i;
const DIRECT_VIDEO_RE = /\.(?:mp4|webm|mov|m4v|ogg)(?:[?#]|$)/i;
const URL_RE = /https?:\/\/\S+/gi;

export const stripForumHtml = (html: string) =>
  html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();

function pressConferencePreviewForForumHtml(html: string): string | null {
  if (/no-press-conference-for-this-game\.jpg/i.test(html)) return "No press conference for this game";
  if (/awaiting-press-conference\.jpg/i.test(html)) {
    const alt = html.match(/<img\b[^>]*\balt=["']([^"']+)["'][^>]*>/i)?.[1]?.trim();
    return alt || "Awaiting press conference";
  }
  return null;
}

function mediaPreviewForForumHtml(html: string): string | null {
  if (YOUTUBE_RE.test(html)) return "YouTube video shared in this topic";
  if (VIMEO_RE.test(html)) return "Vimeo video shared in this topic";
  if (/<(?:video|source)\b/i.test(html) || DIRECT_VIDEO_RE.test(html)) return "Video shared in this topic";
  return null;
}

function isOnlyVideoLinkText(text: string): boolean {
  const urls = text.match(URL_RE) ?? [];
  if (urls.length === 0) return false;
  const textWithoutUrls = text.replace(URL_RE, "").replace(/[\s.,;:!()\[\]{}<>-]+/g, "").trim();
  if (textWithoutUrls.length > 0) return false;
  return urls.every((url) => YOUTUBE_RE.test(url) || VIMEO_RE.test(url) || DIRECT_VIDEO_RE.test(url));
}

export function forumPostPreviewText(body: string): string {
  const text = stripForumHtml(body);
  if (text && !isOnlyVideoLinkText(text)) return text;
  return pressConferencePreviewForForumHtml(body) ?? mediaPreviewForForumHtml(body) ?? "No description added";
}

/** Load forum posts newest first, optionally limited to one author. */
export async function fetchForumFeed(opts: {
  authorId?: string | null;
  page?: number;
  pageSize?: number;
  kind?: "all" | "topics" | "replies";
}): Promise<{ posts: ForumFeedPost[]; total: number }> {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = opts.pageSize ?? FORUM_FEED_PAGE_SIZE;
  const from = (page - 1) * pageSize;

  let q = supabase
    .from("forum_posts")
    .select("id, body, created_at, is_op, topic_id, author_id", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, from + pageSize - 1);
  if (opts.authorId) q = q.eq("author_id", opts.authorId);
  else q = q.neq("author_id", BORO_MATCHDAY_ACTION_AUTHOR_ID);
  if (opts.kind === "topics") q = q.eq("is_op", true);
  if (opts.kind === "replies") q = q.eq("is_op", false);

  const { data, count } = await q;
  const rows = (data ?? []) as Array<{
    id: string;
    body: string;
    created_at: string;
    is_op: boolean;
    topic_id: string;
    author_id: string;
  }>;
  if (rows.length === 0) return { posts: [], total: count ?? 0 };

  const topicIds = Array.from(new Set(rows.map((r) => r.topic_id)));
  const { data: topics } = await supabase
    .from("forum_topics")
    .select("id, title, board_id")
    .in("id", topicIds);
  const topicMap = new Map((topics ?? []).map((t) => [t.id, t as { id: string; title: string; board_id: string }]));

  const boardIds = Array.from(new Set([...topicMap.values()].map((t) => t.board_id)));
  const boardMap = new Map<string, { name: string; slug: string }>();
  if (boardIds.length) {
    const { data: boards } = await supabase.from("forum_boards").select("id, name, slug").in("id", boardIds);
    (boards ?? []).forEach((b) => boardMap.set(b.id, { name: b.name, slug: b.slug }));
  }

  const authorIds = Array.from(new Set(rows.map((r) => r.author_id)));
  const aliasMap = new Map<string, { alias: string; avatar: string | null }>();
  if (authorIds.length) {
    const { data: aliases } = await supabase.rpc("fan_zone_aliases", { _ids: authorIds });
    ((aliases as any[]) ?? []).forEach((a) =>
      aliasMap.set(a.user_id, { alias: a.fan_alias ?? "Boro fan", avatar: a.fan_avatar_url ?? null }),
    );
  }

  const posts = rows
    .map((r) => {
      const topic = topicMap.get(r.topic_id);
      if (!topic) return null;
      const board = boardMap.get(topic.board_id);
      if (!board) return null;
      const who = aliasMap.get(r.author_id);
      return {
        id: r.id,
        body: r.body,
        created_at: r.created_at,
        is_op: r.is_op,
        topic_id: r.topic_id,
        topic_title: topic.title,
        board_slug: board.slug,
        board_name: board.name,
        author_id: r.author_id,
        author_alias: who?.alias ?? "Boro fan",
        author_avatar: who?.avatar ?? null,
      } satisfies ForumFeedPost;
    })
    .filter((p): p is ForumFeedPost => p !== null);

  return { posts, total: count ?? posts.length };
}

/**
 * Unread counts for the "New content" tabs, split into new topics and replies.
 * `since` is the fan's last-viewed marker; ids already opened locally are removed.
 */
export async function fetchForumUnreadCounts(
  since: string | null,
  readIds: Set<string>,
): Promise<{ topics: number; replies: number }> {
  if (!since) return { topics: 0, replies: 0 };
  const { data } = await supabase
    .from("forum_posts")
    .select("id, is_op")
    .neq("author_id", BORO_MATCHDAY_ACTION_AUTHOR_ID)
    .gt("created_at", since)
    .order("created_at", { ascending: false })
    .limit(500);
  let topics = 0;
  let replies = 0;
  for (const row of (data ?? []) as Array<{ id: string; is_op: boolean }>) {
    if (readIds.has(row.id)) continue;
    if (row.is_op) topics += 1;
    else replies += 1;
  }
  return { topics, replies };
}
