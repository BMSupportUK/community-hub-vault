import { supabase } from "@/integrations/supabase/client";

export const FORUM_FEED_PAGE_SIZE = 20;

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

export const stripForumHtml = (html: string) =>
  html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();

/** Load forum posts newest first, optionally limited to one author. */
export async function fetchForumFeed(opts: {
  authorId?: string | null;
  page?: number;
  pageSize?: number;
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
