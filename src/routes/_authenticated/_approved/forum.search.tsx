import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Search as SearchIcon, Loader2, MessageSquare, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatLastSeen } from "@/lib/relative-time";
import { censorText } from "@/lib/profanity";

export const Route = createFileRoute("/_authenticated/_approved/forum/search")({
  head: () => ({
    meta: [
      { title: "Search the Boro Fan Zone | BM Support" },
      { name: "description", content: "Search Middlesbrough supporter topics and replies across every Boro Fan Zone board." },
      { property: "og:title", content: "Search the Boro Fan Zone | BM Support" },
      { property: "og:description", content: "Search Middlesbrough supporter topics and replies across every Boro Fan Zone board." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  validateSearch: (search: Record<string, unknown>) => ({
    q: typeof search.q === "string" ? search.q : "",
  }),
  component: FanZoneSearchPage,
});

type Hit = {
  kind: "topic" | "reply";
  topicId: string;
  title: string;
  boardName: string;
  boardSlug: string;
  authorId: string;
  authorName: string;
  createdAt: string;
  snippet: string;
};

const stripHtml = (html: string) =>
  html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();

function snippetAround(text: string, term: string) {
  const idx = text.toLowerCase().indexOf(term.toLowerCase());
  if (idx < 0) return text.slice(0, 220);
  const start = Math.max(0, idx - 80);
  return `${start > 0 ? "…" : ""}${text.slice(start, start + 220)}${text.length > start + 220 ? "…" : ""}`;
}

function Highlight({ text, term }: { text: string; term: string }) {
  if (!term.trim()) return <>{text}</>;
  const lower = text.toLowerCase();
  const t = term.toLowerCase();
  const parts: React.ReactNode[] = [];
  let i = 0;
  let key = 0;
  while (i < text.length) {
    const at = lower.indexOf(t, i);
    if (at < 0) {
      parts.push(text.slice(i));
      break;
    }
    if (at > i) parts.push(text.slice(i, at));
    parts.push(
      <mark key={key++} className="rounded bg-[#E11B22]/35 px-0.5 text-white">
        {text.slice(at, at + term.length)}
      </mark>,
    );
    i = at + term.length;
  }
  return <>{parts}</>;
}

function FanZoneSearchPage() {
  const { q } = Route.useSearch();
  const navigate = useNavigate();
  const [term, setTerm] = useState(q);
  const [loading, setLoading] = useState(false);
  const [hits, setHits] = useState<Hit[]>([]);
  const [searched, setSearched] = useState(false);

  useEffect(() => setTerm(q), [q]);

  const run = useCallback(async (raw: string) => {
    const needle = raw.trim();
    if (needle.length < 2) {
      setHits([]);
      setSearched(false);
      return;
    }
    setLoading(true);
    try {
      const pattern = `%${needle.replace(/[%_]/g, (m) => `\\${m}`)}%`;
      const [topicsRes, postsRes] = await Promise.all([
        supabase
          .from("forum_topics")
          .select("id, title, board_id, author_id, created_at")
          .ilike("title", pattern)
          .order("created_at", { ascending: false })
          .limit(40),
        supabase
          .from("forum_posts")
          .select("id, body, topic_id, author_id, created_at")
          .ilike("body", pattern)
          .order("created_at", { ascending: false })
          .limit(60),
      ]);

      const topicRows = topicsRes.data ?? [];
      const postRows = postsRes.data ?? [];

      const missingTopicIds = Array.from(
        new Set(postRows.map((p) => p.topic_id).filter((id) => !topicRows.some((t) => t.id === id))),
      );
      let extraTopics: { id: string; title: string; board_id: string }[] = [];
      if (missingTopicIds.length) {
        const { data } = await supabase
          .from("forum_topics")
          .select("id, title, board_id")
          .in("id", missingTopicIds);
        extraTopics = data ?? [];
      }
      const topicMap = new Map<string, { title: string; board_id: string }>();
      [...topicRows, ...extraTopics].forEach((t) => topicMap.set(t.id, { title: t.title, board_id: t.board_id }));

      const boardIds = Array.from(new Set([...topicMap.values()].map((t) => t.board_id)));
      const boardMap = new Map<string, { name: string; slug: string }>();
      if (boardIds.length) {
        const { data: boards } = await supabase.from("forum_boards").select("id, name, slug").in("id", boardIds);
        (boards ?? []).forEach((b) => boardMap.set(b.id, { name: b.name, slug: b.slug }));
      }

      const authorIds = Array.from(new Set([...topicRows, ...postRows].map((r) => r.author_id)));
      const aliasMap = new Map<string, string>();
      if (authorIds.length) {
        const { data: aliases } = await supabase.rpc("fan_zone_aliases", { _ids: authorIds });
        (aliases ?? []).forEach((a: { user_id: string; fan_alias: string | null }) =>
          aliasMap.set(a.user_id, a.fan_alias ?? "Boro Fan"),
        );
      }

      const build = (
        kind: Hit["kind"],
        topicId: string,
        authorId: string,
        createdAt: string,
        snippet: string,
      ): Hit | null => {
        const topic = topicMap.get(topicId);
        if (!topic) return null;
        const board = boardMap.get(topic.board_id);
        if (!board) return null;
        return {
          kind,
          topicId,
          title: topic.title,
          boardName: board.name,
          boardSlug: board.slug,
          authorId,
          authorName: aliasMap.get(authorId) ?? "Boro Fan",
          createdAt,
          snippet,
        };
      };

      const results: Hit[] = [];
      topicRows.forEach((t) => {
        const hit = build("topic", t.id, t.author_id, t.created_at, "");
        if (hit) results.push(hit);
      });
      postRows.forEach((p) => {
        const text = stripHtml(p.body ?? "");
        const hit = build("reply", p.topic_id, p.author_id, p.created_at, snippetAround(text, needle));
        if (hit) results.push(hit);
      });
      results.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      setHits(results);
      setSearched(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void run(q);
  }, [q, run]);

  return (
    <div className="max-w-4xl">
      <div className="mb-4 flex items-center gap-2">
        <Button asChild size="sm" variant="outline" className="border-white/25 bg-black/40 text-white hover:bg-black/60 hover:text-white">
          <Link to="/forum"><ArrowLeft className="size-4 mr-1.5" />Boards</Link>
        </Button>
      </div>

      <div className="rounded-xl border border-[#E11B22]/50 bg-gradient-to-br from-[#1a0507]/95 via-[#12161f]/95 to-[#0B0E14]/95 p-4 sm:p-5 shadow-[0_14px_40px_-16px_rgba(0,0,0,0.85)]">
        <h1 className="font-display text-2xl font-black text-white mb-1">Search the Fan Zone</h1>
        <p className="text-sm text-white/70 mb-4">Find topics and replies across every board you can access.</p>
        <form
          className="flex flex-col sm:flex-row gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void navigate({ to: "/forum/search", search: { q: term.trim() } });
          }}
        >
          <div className="relative flex-1">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/50" />
            <Input
              autoFocus
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Search topics and replies…"
              className="pl-9 bg-black/50 border-white/25 text-white placeholder:text-white/45"
            />
          </div>
          <Button type="submit" className="bg-gradient-to-r from-[#E11B22] to-[#8B0F14] hover:from-[#F02B30] hover:to-[#9B1118] border-0 text-white">
            Search
          </Button>
        </form>
      </div>

      <div className="mt-5 space-y-3">
        {loading && (
          <div className="flex items-center gap-2 text-white/70 text-sm">
            <Loader2 className="size-4 animate-spin" /> Searching…
          </div>
        )}
        {!loading && searched && hits.length === 0 && (
          <p className="text-sm text-white/70">No results for “{q}”.</p>
        )}
        {!loading &&
          hits.map((hit, i) => (
            <Link
              key={`${hit.kind}-${hit.topicId}-${i}`}
              to="/forum/$board/$topic"
              params={{ board: hit.boardSlug, topic: hit.topicId }}
              className="block rounded-lg border border-white/12 bg-gradient-to-r from-[#141821]/95 to-[#0B0E14]/95 p-3.5 transition-colors hover:border-[#E11B22]/60 hover:from-[#1c1016]/95"
            >
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-white/55">
                <span className="rounded bg-[#E11B22]/25 px-1.5 py-0.5 font-bold text-[#ffb3b6]">
                  {hit.kind === "topic" ? "Topic" : "Reply"}
                </span>
                <span>{hit.boardName}</span>
                <span>·</span>
                <span>{hit.authorName}</span>
                <span>·</span>
                <span>{formatLastSeen(hit.createdAt)}</span>
              </div>
              <div className="mt-1 font-semibold text-white">
                <Highlight text={censorText(hit.title)} term={q} />
              </div>
              {hit.snippet && (
                <p className="mt-1 text-sm text-white/75">
                  <MessageSquare className="mr-1 inline size-3.5 align-[-2px] text-white/45" />
                  <Highlight text={censorText(hit.snippet)} term={q} />
                </p>
              )}
            </Link>
          ))}
      </div>
    </div>
  );
}
