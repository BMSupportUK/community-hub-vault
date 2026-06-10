import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Lock, Pin, MessageSquare, Eye, ArrowLeft } from "lucide-react";
import { listPublicTopics, type PublicTopicRow } from "@/lib/fan-zone-public.functions";
import { formatLastSeen } from "@/lib/relative-time";
import { Button } from "@/components/ui/button";
import { FanZoneShell } from "./fan-zone";

export const Route = createFileRoute("/fan-zone/$board")({
  head: ({ params }) => ({
    meta: [
      { title: `${params.board.replace(/-/g, " ")} — Boro Fan Zone` },
      { name: "description", content: `Topics in the ${params.board} board of the Boro Fan Zone.` },
    ],
  }),
  component: BoardTopicsPage,
});

function BoardTopicsPage() {
  const { board: slug } = Route.useParams();
  const fetchTopics = useServerFn(listPublicTopics);
  const [page, setPage] = useState(1);
  const [state, setState] = useState<Awaited<ReturnType<typeof listPublicTopics>> | null>(null);
  useEffect(() => {
    setState(null);
    void fetchTopics({ data: { slug, page } }).then(setState);
  }, [slug, page, fetchTopics]);

  const totalPages = state ? Math.max(1, Math.ceil(state.total / (state.pageSize ?? 20))) : 1;

  return (
    <FanZoneShell>
      <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2 text-white/80 hover:text-white">
        <Link to="/fan-zone"><ArrowLeft className="size-4 mr-1" /> All boards</Link>
      </Button>
      {!state ? (
        <div className="grid place-items-center py-20 text-white/60"><Loader2 className="size-5 animate-spin" /></div>
      ) : !state.board ? (
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
                  <Link
                    to="/fan-zone/$board/$topic"
                    params={{ board: slug, topic: t.id }}
                    className="block rounded-xl border border-white/10 bg-white/5 hover:border-[#E11B22]/60 hover:bg-white/10 p-4 transition-colors"
                  >
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
                      <span className="font-display font-semibold text-white">{t.title}</span>
                    </div>
                    <div className="mt-2 text-[11px] text-white/60 flex items-center gap-2 flex-wrap">
                      <span>by <span className="text-white/90">{t.author_alias}</span></span>
                      <span className="text-white/30">·</span>
                      <span>{formatLastSeen(t.created_at)}</span>
                      <span className="ml-auto inline-flex items-center gap-3">
                        <span className="inline-flex items-center gap-1"><MessageSquare className="size-3 text-[#E11B22]" />{t.reply_count}</span>
                        <span className="inline-flex items-center gap-1"><Eye className="size-3" />{t.view_count}</span>
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {totalPages > 1 && (
            <div className="mt-5 flex items-center justify-center gap-2 text-sm text-white/70">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</Button>
              <span>Page {page} of {totalPages}</span>
              <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
          )}
        </>
      )}
    </FanZoneShell>
  );
}