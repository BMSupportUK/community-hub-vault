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
  last_topic_title: string | null;
  last_poster_alias: string | null;
  last_poster_id: string | null;
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
  author_id: string;
};

export type PublicPost = {
  id: string;
  body: string;
  is_op: boolean;
  is_pinned: boolean;
  created_at: string;
  author_id: string;
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
let guestBoardCache: { at: number; ids: Set<string> } | null = null;
const GUEST_BOARD_CACHE_MS = 60_000;

/**
 * Returns the set of board IDs guests are allowed to view: boards with an
 * explicit `forum_board_permissions` row role='guest' AND can_view=true.
 * Boards with no guest row (or can_view=false) are hidden — this matches
 * exactly what the admin permissions screen displays (unchecked = denied).
 */
async function guestVisibleBoardIds(
  admin: { from: (t: string) => any },
): Promise<Set<string>> {
  if (guestBoardCache && Date.now() - guestBoardCache.at < GUEST_BOARD_CACHE_MS) return guestBoardCache.ids;
  const { data } = await admin
    .from("forum_board_permissions")
    .select("board_id, can_view")
    .eq("role", "guest");
  const out = new Set<string>();
  ((data ?? []) as Array<{ board_id: string; can_view: boolean }>).forEach((r) => {
    if (r.can_view) out.add(r.board_id);
  });
  guestBoardCache = { at: Date.now(), ids: out };
  return out;
}

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
  const [boardsResult, visible] = await Promise.all([
    supabaseAdmin
      .from("forum_boards")
      .select(
        "id, name, slug, description, icon, is_pinned, is_locked, topic_count, post_count, last_post_at, last_post_by, sort_order",
      )
      .order("is_pinned", { ascending: false })
      .order("sort_order"),
    guestVisibleBoardIds(supabaseAdmin),
  ]);
  const { data, error } = boardsResult;
  if (error) throw error;
  type Row = {
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
    last_post_by: string | null;
  };
  const rows = ((data ?? []) as unknown as Row[]).filter((b) => visible.has(b.id));

  // Latest topic title per visible board + alias of the last poster.
  const boardIds = rows.filter((b) => b.last_post_at).map((b) => b.id);
  const lastTitles: Record<string, string> = {};
  if (boardIds.length) {
    const { data: topics } = await supabaseAdmin
      .from("forum_topics")
      .select("id, title, board_id, last_post_at")
      .in("board_id", boardIds)
      .order("last_post_at", { ascending: false });
    ((topics ?? []) as Array<{ title: string; board_id: string }>).forEach((t) => {
      if (!lastTitles[t.board_id]) lastTitles[t.board_id] = t.title;
    });
  }
  const aliases = await loadAliases(
    supabaseAdmin,
    rows.map((b) => b.last_post_by).filter((x): x is string => !!x),
  );

  return rows.map((b) => ({
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
    last_topic_title: lastTitles[b.id] ?? null,
    last_poster_alias: b.last_post_by ? aliases[b.last_post_by]?.alias ?? "Boro Fan" : null,
    last_poster_id: b.last_post_by,
  })) as PublicBoard[];
});

export type PublicForumStats = {
  threads: number;
  replies: number;
  members: number;
  latest_member: string | null;
  latest_member_id: string | null;
};

export type PublicStaffMember = {
  user_id: string;
  role: "admin" | "boro_fan_zone_moderator";
  fan_alias: string;
  fan_avatar_url: string | null;
};

/** Guest-visible Fan Zone staff list (admins first, then moderators). */
export const getPublicFanZoneStaff = createServerFn({ method: "GET" }).handler(async (): Promise<PublicStaffMember[]> => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: roles } = await supabaseAdmin
    .from("user_roles")
    .select("user_id, role")
    .in("role", ["admin", "boro_fan_zone_moderator"]);
  const rows = (roles ?? []) as Array<{ user_id: string; role: PublicStaffMember["role"] }>;
  if (!rows.length) return [];
  const ids = rows.map((r) => r.user_id);
  const [aliases, profiles] = await Promise.all([
    loadAliases(supabaseAdmin, ids),
    supabaseAdmin.from("profiles").select("id, display_name, username").in("id", ids),
  ]);
  const profMap: Record<string, { display_name: string | null; username: string | null }> = {};
  ((profiles.data ?? []) as Array<{ id: string; display_name: string | null; username: string | null }>).forEach((p) => {
    profMap[p.id] = { display_name: p.display_name, username: p.username };
  });
  const out = rows.map((r) => ({
    user_id: r.user_id,
    role: r.role,
    fan_alias:
      aliases[r.user_id]?.alias ||
      profMap[r.user_id]?.display_name?.trim() ||
      profMap[r.user_id]?.username?.trim() ||
      "Boro Fan",
    fan_avatar_url: aliases[r.user_id]?.avatar || null,
  }));
  out.sort((a, b) => {
    if (a.role !== b.role) return a.role === "admin" ? -1 : 1;
    return a.fan_alias.toLowerCase().localeCompare(b.fan_alias.toLowerCase());
  });
  return out;
});

/** Guest-visible forum statistics for the Fan Zone sidebar panel. */
export const getPublicForumStats = createServerFn({ method: "GET" }).handler(async (): Promise<PublicForumStats> => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [boards, memberCount, latest] = await Promise.all([
    supabaseAdmin.from("forum_boards").select("topic_count, post_count"),
    supabaseAdmin
      .from("fan_zone_members")
      .select("user_id", { count: "exact", head: true })
      .eq("status", "approved"),
    supabaseAdmin
      .from("fan_zone_members")
      .select("user_id, fan_alias, decided_at")
      .eq("status", "approved")
      .order("decided_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const rows = (boards.data ?? []) as Array<{ topic_count: number; post_count: number }>;
  return {
    threads: rows.reduce((s, b) => s + (b.topic_count || 0), 0),
    replies: rows.reduce((s, b) => s + Math.max(0, (b.post_count || 0) - (b.topic_count || 0)), 0),
    members: memberCount.count ?? 0,
    latest_member: (latest.data as { fan_alias: string | null } | null)?.fan_alias?.trim() || null,
    latest_member_id: (latest.data as { user_id: string } | null)?.user_id ?? null,
  };
});

export const listPublicTopics = createServerFn({ method: "GET" })
  .inputValidator((d) =>
    z.object({ slug: z.string().min(1).max(80), page: z.number().int().min(1).max(500).default(1) }).parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [boardResult, visible] = await Promise.all([
      supabaseAdmin
        .from("forum_boards")
        .select("id, name, slug, description, is_locked")
        .eq("slug", data.slug)
        .maybeSingle(),
      guestVisibleBoardIds(supabaseAdmin),
    ]);
    const { data: b } = boardResult;
    if (!b) return { board: null, topics: [] as PublicTopicRow[], total: 0, page: data.page };
    if (!visible.has((b as { id: string }).id)) {
      return { board: null, topics: [] as PublicTopicRow[], total: 0, page: data.page };
    }
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
        author_id: t.author_id,
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
    const [visible, boardResult, postsResult] = await Promise.all([
      guestVisibleBoardIds(supabaseAdmin),
      supabaseAdmin
        .from("forum_boards")
        .select("id, name, slug")
        .eq("id", topic.board_id)
        .maybeSingle(),
      supabaseAdmin
        .from("forum_posts")
        .select("id, author_id, body, is_op, is_pinned, created_at")
        .eq("topic_id", topic.id)
        .order("is_op", { ascending: false })
        .order("is_pinned", { ascending: false })
        .order("created_at", { ascending: true }),
    ]);
    if (!visible.has(topic.board_id)) return null;
    const { data: bd } = boardResult;
    const { data: ps } = postsResult;
    const list = (ps ?? []) as Array<{ id: string; author_id: string; body: string; is_op: boolean; is_pinned: boolean | null; created_at: string }>;
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
        is_pinned: !!p.is_pinned,
        created_at: p.created_at,
        author_id: p.author_id,
        author_alias: aliases[p.author_id]?.alias ?? "Boro Fan",
        author_avatar: aliases[p.author_id]?.avatar ?? null,
      })),
    };
  });