import { createFileRoute, Link } from "@tanstack/react-router";
import { Trophy, Medal, Award, Loader2, ArrowRight, CheckCircle2 } from "lucide-react";
import { useCompetitionWinners } from "@/hooks/use-finished-competitions";
import { COMPETITIONS } from "@/lib/competitions";
import { LandingHeader } from "@/components/LandingHeader";
import { IconRail } from "@/components/app/IconRail";
import { FanZonePublicHeader } from "@/components/app/FanZonePublicHeader";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/competition-winners")({
  component: CompetitionWinnersPage,
  head: () => ({
    meta: [
      { title: "Competition Winners — BM Support Predictor Games" },
      { name: "description", content: "Hall of fame for BM Support prediction competitions — see who won the World Cup 2026 and Boro predictor games." },
      { property: "og:title", content: "Competition Winners — BM Support" },
      { property: "og:description", content: "See the winners of every finished BM Support prediction competition." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { rel: "canonical", href: "https://bmsupport.uk/competition-winners" },
    ],
  }),
});

const placeIcon = (place: number) =>
  place === 1 ? Trophy : place === 2 ? Medal : Award;

const placeLabel = (place: number) =>
  place === 1 ? "1st place" : place === 2 ? "2nd place" : `${place}rd place`;

function CompetitionWinnersPage() {
  const { user } = useAuth();
  const { data, isLoading } = useCompetitionWinners();
  const summary = data ?? [];

  const finished = COMPETITIONS.filter(
    (c) => summary.find((s) => s.competition === c.key)?.finished,
  );
  const running = COMPETITIONS.filter(
    (c) => !summary.find((s) => s.competition === c.key)?.finished,
  );

  return (
    <div className="flex min-h-dvh bg-background">
      <IconRail />
      <main className="min-w-0 flex-1">
      {!user ? <FanZonePublicHeader /> : <LandingHeader />}
      <div className="mx-auto w-full max-w-5xl px-4 py-6 space-y-8">
        <header className="space-y-1">
          <h1 className="font-display text-2xl font-bold flex items-center gap-2">
            <Trophy className="size-6 text-primary" />
            Competition Winners
          </h1>
          <p className="text-sm text-muted-foreground">
            Every finished competition lives here — hall of fame plus a link back to the full leaderboard.
          </p>
        </header>

        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading winners…
          </div>
        ) : null}

        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Finished competitions
          </h2>
          {finished.length === 0 && !isLoading ? (
            <div className="rounded-2xl border border-border bg-surface p-6 text-sm text-muted-foreground">
              No competitions have finished yet. Once winners are announced, the competition moves here.
            </div>
          ) : null}
          <div className="grid gap-4 md:grid-cols-2">
            {finished.map((c) => {
              const s = summary.find((x) => x.competition === c.key);
              return (
                <div
                  key={c.key}
                  className="rounded-2xl border border-primary/40 bg-surface p-5 shadow-glow/20 space-y-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-display text-lg font-bold">{c.title}</h3>
                      <p className="text-xs text-muted-foreground">{c.description}</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-primary/15 px-2.5 py-1 text-[11px] font-semibold text-primary">
                      Finished
                    </span>
                  </div>

                  <ul className="space-y-2">
                    {(s?.winners ?? [])
                      .slice()
                      .sort((a, b) => a.place - b.place)
                      .map((w) => {
                        const Icon = placeIcon(w.place);
                        return (
                          <li
                            key={w.place}
                            className="flex items-center gap-3 rounded-xl border border-border bg-surface-2 px-3 py-2"
                          >
                            <Icon className="size-5 text-primary" />
                            <span className="text-xs text-muted-foreground w-20">{placeLabel(w.place)}</span>
                            <span className="font-semibold text-sm truncate">{w.displayName}</span>
                            {w.confirmed ? (
                              <CheckCircle2 className="ml-auto size-4 text-primary" aria-label="Email confirmed" />
                            ) : null}
                          </li>
                        );
                      })}
                  </ul>

                  <Link
                    to={c.to}
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                  >
                    Open {c.railLabel} <ArrowRight className="size-4" />
                  </Link>
                </div>
              );
            })}
          </div>
        </section>

        {running.length > 0 ? (
          <section className="space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Still running
            </h2>
            <div className="grid gap-4 md:grid-cols-2">
              {running.map((c) => (
                <div key={c.key} className="rounded-2xl border border-border bg-surface p-5 space-y-2">
                  <h3 className="font-display text-lg font-bold">{c.title}</h3>
                  <p className="text-xs text-muted-foreground">{c.description}</p>
                  <Link
                    to={c.to}
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                  >
                    Play now <ArrowRight className="size-4" />
                  </Link>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>
      </main>
    </div>
  );
}
