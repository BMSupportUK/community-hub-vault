import { createFileRoute, Navigate, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Trophy, Star, X } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getFantasyMotmData, adminSetFantasyMotm } from "@/lib/fantasy.functions";

export const Route = createFileRoute("/_authenticated/_approved/admin-fantasy-motm")({
  head: () => ({
    meta: [
      { title: "Fantasy Man of the Match — Owner" },
      { name: "description", content: "Award the 3-point Man of the Match bonus for each MFC Fantasy Manager gameweek." },
      { property: "og:title", content: "Fantasy Man of the Match — Owner" },
      { property: "og:description", content: "Award the 3-point Man of the Match bonus for each MFC Fantasy Manager gameweek." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminFantasyMotmPage,
});

const LEVEL_LABEL: Record<string, string> = { first: "First team", u21: "U21", u18: "U18" };

function AdminFantasyMotmPage() {
  const { hasAny } = useAuth();
  const isAdmin = hasAny(["admin", "management"]);
  const load = useServerFn(getFantasyMotmData);
  const setMotm = useServerFn(adminSetFantasyMotm);
  const qc = useQueryClient();
  const [gwId, setGwId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [onlyPlayed, setOnlyPlayed] = useState(true);

  const { data, isLoading } = useQuery({
    queryKey: ["fantasy-motm"],
    queryFn: () => load(),
    enabled: isAdmin,
  });

  const gameweeks = data?.gameweeks ?? [];
  const selected = useMemo(
    () => gameweeks.find((g) => g.gameweekId === gwId) ?? gameweeks.slice().reverse().find((g) => g.status !== "upcoming") ?? gameweeks[0],
    [gameweeks, gwId],
  );

  const players = useMemo(() => {
    let list = data?.players ?? [];
    if (selected && onlyPlayed) {
      const played = new Set(selected.playedPlayerIds);
      list = list.filter((p) => played.has(p.id) || p.id === selected.motmPlayerId);
    }
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((p) => p.name.toLowerCase().includes(q));
    return list;
  }, [data?.players, selected, onlyPlayed, search]);

  if (!isAdmin) return <Navigate to="/home" />;

  const award = async (playerId: string | null) => {
    if (!selected) return;
    setSaving(true);
    try {
      await setMotm({ data: { gameweekId: selected.gameweekId, fixtureId: selected.fixtureId, playerId } });
      toast.success(playerId ? "Man of the match awarded (+3 pts) — points recalculated" : "Man of the match cleared — points recalculated");
      await qc.invalidateQueries({ queryKey: ["fantasy-motm"] });
      // Managers' squads, leaderboard and player pages all depend on the new scores.
      await qc.invalidateQueries({ predicate: (q) => String(q.queryKey?.[0] ?? "").startsWith("fantasy") });
    } catch (e: any) {
      toast.error(e?.message ?? "Could not save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link to="/admin">
            <ArrowLeft className="size-4 mr-1" /> Owner panel
          </Link>
        </Button>
      </div>
      <header className="space-y-1">
        <h1 className="font-display text-2xl flex items-center gap-2">
          <Trophy className="size-6 text-primary" /> Fantasy Man of the Match
        </h1>
        <p className="text-sm text-muted-foreground">
          Pick one player per gameweek to receive the 3-point Man of the Match bonus. Scores are recalculated straight away.
        </p>
      </header>

      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading gameweeks…
        </div>
      ) : !gameweeks.length ? (
        <p className="text-sm text-muted-foreground">No fantasy gameweeks yet.</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
          <aside className="space-y-2">
            <h2 className="text-xs uppercase tracking-wide text-muted-foreground">Gameweeks</h2>
            <div className="max-h-[60vh] overflow-y-auto rounded-lg border border-border divide-y divide-border">
              {gameweeks.map((g) => (
                <button
                  key={g.gameweekId}
                  type="button"
                  onClick={() => setGwId(g.gameweekId)}
                  className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                    selected?.gameweekId === g.gameweekId ? "bg-primary/10 text-foreground" : "hover:bg-muted/50"
                  }`}
                >
                  <span className="font-medium">GW{g.gwNumber}</span> — {g.label}
                  <span className="block text-xs text-muted-foreground">
                    {g.competition} ·{" "}
                    {g.dateTbc ? "Date TBC" : new Date(g.kickoffAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                    {g.motmPlayerId ? " · MOTM set" : ""}
                  </span>
                </button>
              ))}
            </div>
          </aside>

          <section className="space-y-3">
            {selected && (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="font-display text-lg">
                      GW{selected.gwNumber} — {selected.label}
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      Current pick:{" "}
                      {selected.motmPlayerId
                        ? (data?.players.find((p) => p.id === selected.motmPlayerId)?.name ?? "Unknown player")
                        : "none"}
                    </p>
                  </div>
                  {selected.motmPlayerId && (
                    <Button variant="outline" size="sm" disabled={saving} onClick={() => award(null)}>
                      <X className="size-4 mr-1" /> Clear
                    </Button>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search players…"
                    className="max-w-xs"
                  />
                  <Button variant={onlyPlayed ? "default" : "outline"} size="sm" onClick={() => setOnlyPlayed((v) => !v)}>
                    {onlyPlayed ? "Showing players with minutes" : "Showing all players"}
                  </Button>
                </div>

                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {players.map((p) => {
                    const isPick = p.id === selected.motmPlayerId;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        disabled={saving}
                        onClick={() => award(isPick ? null : p.id)}
                        className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors disabled:opacity-60 ${
                          isPick ? "border-primary bg-primary/10" : "border-border hover:bg-muted/50"
                        }`}
                      >
                        <span>
                          <span className="font-medium">{p.name}</span>
                          <span className="block text-xs text-muted-foreground uppercase">
                            {p.position} · {LEVEL_LABEL[p.squadLevel] ?? p.squadLevel}
                          </span>
                        </span>
                        <Star className={`size-4 shrink-0 ${isPick ? "text-primary fill-primary" : "text-muted-foreground"}`} />
                      </button>
                    );
                  })}
                  {!players.length && <p className="text-sm text-muted-foreground">No players match that filter.</p>}
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}