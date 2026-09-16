import { Link } from "@tanstack/react-router";
import { Loader2, MessageSquare } from "lucide-react";
import { censorText } from "@/lib/profanity";
import { RelativeTime } from "@/components/app/RelativeTime";
import { BORO_DEFAULT_AVATAR_URL as boroDefaultAvatar } from "@/lib/boro-default-avatar";
import { stripForumHtml, type ForumFeedPost } from "@/lib/forum-feed";

export function ForumPostFeed({
  posts,
  loading,
  showAuthor = false,
  empty = "Nothing posted yet.",
  variant = "list",
}: {
  posts: ForumFeedPost[];
  loading: boolean;
  showAuthor?: boolean;
  empty?: string;
  variant?: "list" | "grid";
}) {
  if (loading) {
    return (
      <div className="grid place-items-center py-10 text-white/70">
        <Loader2 className="size-5 animate-spin" />
      </div>
    );
  }
  if (posts.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-white/15 p-8 text-center text-sm text-white/60">
        {empty}
      </div>
    );
  }
  const listClasses =
    variant === "grid"
      ? "grid grid-cols-1 items-start gap-3 sm:grid-cols-2 xl:grid-cols-3"
      : "space-y-2.5";
  return (
    <ul className={listClasses}>
      {posts.map((p) => (
        <li key={p.id}>
          <Link
            to="/forum/$board/$topic"
            params={{ board: p.board_slug, topic: p.topic_id }}
            className="block h-full rounded-xl border border-white/12 bg-white/5 p-3.5 transition-colors hover:border-[#E11B22]/60 hover:bg-white/10"
          >
            <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-wide text-white/55">
              <span className="rounded-full bg-[#E11B22]/25 px-2 py-0.5 font-semibold text-[#FFD3D5]">
                {p.is_op ? "Topic" : "Reply"}
              </span>
              <span className="break-words">{p.board_name}</span>
              <span aria-hidden>·</span>
              <RelativeTime iso={p.created_at} />
            </div>
            <div className="mt-1.5 font-display text-[15px] font-bold leading-snug text-white break-words">
              {censorText(p.topic_title)}
            </div>
            {showAuthor && (
              <div className="mt-1.5 flex items-center gap-2 text-xs text-white/70">
                <img
                  src={p.author_avatar || boroDefaultAvatar}
                  alt=""
                  className="size-5 rounded-full object-cover ring-1 ring-white/15"
                />
                <span className="truncate font-semibold">{p.author_alias}</span>
              </div>
            )}
            <p
              className={
                variant === "grid"
                  ? "mt-1.5 text-sm leading-relaxed text-white/75 break-words"
                  : "mt-1.5 line-clamp-3 text-sm text-white/75 break-words"
              }
            >
              {censorText(stripForumHtml(p.body)) || "—"}
            </p>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function ForumFeedPager({
  page,
  total,
  pageSize,
  onPage,
}: {
  page: number;
  total: number;
  pageSize: number;
  onPage: (p: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <div className="mt-4 flex items-center justify-center gap-3 text-sm text-white/80">
      <button
        type="button"
        onClick={() => onPage(page - 1)}
        disabled={page <= 1}
        className="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 font-semibold disabled:opacity-40"
      >
        Previous
      </button>
      <span className="inline-flex items-center gap-1.5">
        <MessageSquare className="size-3.5" />
        Page {page} of {pages}
      </span>
      <button
        type="button"
        onClick={() => onPage(page + 1)}
        disabled={page >= pages}
        className="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 font-semibold disabled:opacity-40"
      >
        Next
      </button>
    </div>
  );
}
