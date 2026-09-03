import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Lock, Pin, MessageSquare, Eye } from "lucide-react";
import { listPublicTopics, type PublicTopicRow } from "@/lib/fan-zone-public.functions";
import { RelativeTime } from "@/components/app/RelativeTime";
import { Button } from "@/components/ui/button";
import { FanZoneShell } from "./fan-zone";

export const Route = createFileRoute("/fan-zone/$board/")({
  validateSearch: (search: Record<string, unknown>): { page?: number } => ({
    page: Math.max(1, Number(search.page) || 1),
  }),
  loaderDeps: ({ search: { page } }) => ({ page: page ?? 1 }),
  loader: ({ params, deps }) => listPublicTopics({ data: { slug: params.board, page: deps.page } }),
  staleTime: 30_000,
  component: BoardTopicsPage,
});

function BoardTopicsPage() {
  const { board: slug } = Route.useParams();
  const { page = 1 } = Route.useSearch();
  const navigate = useNavigate();
  const state = Route.useLoaderData();

  const totalPages = state ? Math.max(1, Math.ceil(state.total / (state.pageSize ?? 20))) : 1;
  const goToPage = (nextPage: number) => {
    void navigate({
      to: "/fan-zone/$board",
      params: { board: slug },
      search: { page: Math.max(1, Math.min(totalPages, nextPage)) },
    });
  };

  return (
    <FanZoneShell>
      <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2 text-white/80 hover:text-white">
        <Link to="/fan-zone"><ArrowLeft className="size-4 mr-1" /> All boards</Link>
      </Button>
      {!state.board ? (
        <div className="rounded-xl border border-white/10 bg-white/5 p-8 text-center text-sm text-white/70">
          Board not found.
        </div>
      ) : (
        <>
          <h1 className="font-display text-2xl font-bold text-white flex items-center gap-2">
            {state.board.is_locked && <Lock className="size-5 text-white/50" />} {state.board.name}
          </h1>
          <p className="text-sm text-white/60 mt-1">{state.board.description}</p>
          {state.topics.length === 0 ? (
            <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-8 text-center text-sm text-white/70">
              No topics yet.
            </div>
          ) : (
            <ul className="mt-5 space-y-2.5">
              {state.topics.map((t: PublicTopicRow) => (
                <li key={t.id}>
                  <article className="rounded-xl border border-white/10 bg-white/5 hover:border-[#E11B22]/60 hover:bg-white/10 p-4 transition-colors">
                    <div className="flex items-center gap-2 flex-wrap">
                      {t.is_sticky && (
                        <span className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-bold uppercase">
                          <Pin className="size-2.5" /> Pinned
                        </span>
                      )}
                      {t.is_locked && (
                        <span className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 bg-white/10 text-white/60 border border-white/15 text-[10px] font-bold uppercase">
                          <Lock className="size-2.5" /> Locked
                        </span>
                      )}
                      <Link to="/fan-zone/$board/$topic" params={{ board: slug, topic: t.id }} className="font-display font-semibold text-white hover:text-[#E11B22]">
                        {t.title}
                      </Link>
                    </div>
                    <div className="mt-2 text-[11px] text-white/60 flex items-center gap-2 flex-wrap">
                      <span>by <Link to="/fan-zone/u/$userId" params={{ userId: t.author_id }} className="text-white/90 hover:text-[#E11B22] hover:underline">{t.author_alias}</Link></span>
                      <span className="text-white/30">·</span>
                      <span><RelativeTime iso={t.created_at} /></span>
                      <span className="ml-auto inline-flex items-center gap-3">
                        <span className="inline-flex items-center gap-1"><MessageSquare className="size-3 text-[#E11B22]" />{t.reply_count}</span>
                        <span className="inline-flex items-center gap-1"><Eye className="size-3" />{t.view_count}</span>
                      </span>
                    </div>
                  </article>
                </li>
              ))}
            </ul>
          )}
          {totalPages > 1 && (
            <div className="mt-5 flex items-center justify-center gap-2 text-sm text-white/70">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => goToPage(page - 1)}>Prev</Button>
              <span>Page {page} of {totalPages}</span>
              <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => goToPage(page + 1)}>Next</Button>
            </div>
          )}
        </>
      )}
    </FanZoneShell>
  );
}