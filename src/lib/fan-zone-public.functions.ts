import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const PAGE_SIZE = 20;

export type PublicBoard = {
  id: string;
  name: string;
  slug: string;
  description: string;
  icon: string;
  is_pinned: boolean;
  is_locked: boolean;
  topic_count: number;
  post_count: number;
  last_post_at: string | null;
};

export type PublicTopicRow = {
  id: string;
  title: string;
  is_sticky: boolean;
  is_locked: boolean;
  view_count: number;
  reply_count: number;
  last_post_at: string;
  created_at: string;
  author_alias: string;
};

export type PublicPost = {
  id: string;
  body: string;
  is_op: boolean;
  created_at: string;
  author_alias: string;
  author_avatar: string | null;
};

export type PublicTopicDetail = {
  topic: {
    id: string;
    title: string;
    is_sticky: boolean;
    is_locked: boolean;
    view_count: number;
    reply_count: number;
    created_at: string;
  };
  board: { id: string; name: string; slug: string };
  posts: PublicPost[];
};

type AliasRow = { user_id: string; fan_alias: string | null; fan_avatar_url: string | null };

async function loadAliases(
  admin: { from: (t: string) => any },
  userIds: string[],
): Promise<Record<string, { alias: string; avatar: string | null }>> {
  const ids = Array.from(new Set(userIds.filter(Boolean)));
  if (!ids.length) return {};
  const { data } = await admin
    .from("fan_zone_members")
    .select("user_id, fan_alias, fan_avatar_url")
    .in("user_id", ids);
  const map: Record<string, { alias: string; avatar: string | null }> = {};
  ((data ?? []) as AliasRow[]).forEach((r) => {
    map[r.user_id] = {
      alias: r.fan_alias?.trim() || "Boro Fan",
      avatar: r.fan_avatar_url || null,
    };
  });
  return map;
}

export const listPublicBoards = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("forum_boards")
    .select(
      "id, name, slug, description, icon, is_pinned, is_locked, topic_count, post_count, last_post_at, sort_order",
    )
    .order("is_pinned", { ascending: false })
    .order("sort_order");
  if (error) throw error;
  return ((data ?? []) as PublicBoard[]).map((b) => ({
    id: b.id,
    name: b.name,
    slug: b.slug,
    description: b.description,
    icon: b.icon,
    is_pinned: b.is_pinned,
    is_locked: b.is_locked,
    topic_count: b.topic_count,
    post_count: b.post_count,
    last_post_at: b.last_post_at,
  })) as PublicBoard[];
});

export const listPublicTopics = createServerFn({ method: "GET" })
  .inputValidator((d) =>
    z.object({ slug: z.string().min(1).max(80), page: z.number().int().min(1).max(500).default(1) }).parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: b } = await supabaseAdmin
      .from("forum_boards")
      .select("id, name, slug, description, is_locked")
      .eq("slug", data.slug)
      .maybeSingle();
    if (!b) return { board: null, topics: [] as PublicTopicRow[], total: 0, page: data.page };
    const from = (data.page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const { data: ts, count } = await supabaseAdmin
      .from("forum_topics")
      .select(
        "id, title, author_id, is_sticky, is_locked, view_count, reply_count, last_post_at, created_at",
        { count: "exact" },
      )
      .eq("board_id", (b as { id: string }).id)
      .order("is_sticky", { ascending: false })
      .order("last_post_at", { ascending: false })
      .range(from, to);
    const list = (ts ?? []) as Array<PublicTopicRow & { author_id: string }>;
    const aliases = await loadAliases(supabaseAdmin, list.map((t) => t.author_id));
    return {
      board: b as { id: string; name: string; slug: string; description: string; is_locked: boolean },
      topics: list.map((t) => ({
        id: t.id,
        title: t.title,
        is_sticky: t.is_sticky,
        is_locked: t.is_locked,
        view_count: t.view_count,
        reply_count: t.reply_count,
        last_post_at: t.last_post_at,
        created_at: t.created_at,
        author_alias: aliases[t.author_id]?.alias ?? "Boro Fan",
      })) as PublicTopicRow[],
      total: count ?? list.length,
      page: data.page,
      pageSize: PAGE_SIZE,
    };
  });

export const getPublicTopic = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ topicId: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<PublicTopicDetail | null> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: t } = await supabaseAdmin
      .from("forum_topics")
      .select("id, title, board_id, is_sticky, is_locked, view_count, reply_count, created_at")
      .eq("id", data.topicId)
      .maybeSingle();
    if (!t) return null;
    const topic = t as {
      id: string;
      title: string;
      board_id: string;
      is_sticky: boolean;
      is_locked: boolean;
      view_count: number;
      reply_count: number;
      created_at: string;
    };
    const { data: bd } = await supabaseAdmin
      .from("forum_boards")
      .select("id, name, slug")
      .eq("id", topic.board_id)
      .maybeSingle();
    const { data: ps } = await supabaseAdmin
      .from("forum_posts")
      .select("id, author_id, body, is_op, created_at")
      .eq("topic_id", topic.id)
      .order("is_op", { ascending: false })
      .order("created_at", { ascending: true });
    const list = (ps ?? []) as Array<{ id: string; author_id: string; body: string; is_op: boolean; created_at: string }>;
    const aliases = await loadAliases(supabaseAdmin, list.map((p) => p.author_id));
    return {
      topic: {
        id: topic.id,
        title: topic.title,
        is_sticky: topic.is_sticky,
        is_locked: topic.is_locked,
        view_count: topic.view_count,
        reply_count: topic.reply_count,
        created_at: topic.created_at,
      },
      board: (bd ?? { id: topic.board_id, name: "", slug: "" }) as { id: string; name: string; slug: string },
      posts: list.map((p) => ({
        id: p.id,
        body: p.body,
        is_op: p.is_op,
        created_at: p.created_at,
        author_alias: aliases[p.author_id]?.alias ?? "Boro Fan",
        author_avatar: aliases[p.author_id]?.avatar ?? null,
      })),
    };
  });