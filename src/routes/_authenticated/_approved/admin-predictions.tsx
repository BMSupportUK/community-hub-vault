import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Trophy, Plus, Trash2, Save, RefreshCw, Loader2, ListOrdered, Settings as SettingsIcon, CalendarDays, Star } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import {
  listWcFixtures,
  adminUpsertWcFixture,
  adminDeleteWcFixture,
  adminSetWcResult,
  adminRescoreAllWc,
  getWcLeaderboard,
  getWcSettings,
  adminSetWcSettings,
  type WcFixtureDTO,
  type WcStage,
  type WcLeaderboardRowDTO,
  type WcSettingsDTO,
} from "@/lib/wc-predictions.functions";

export const Route = createFileRoute("/_authenticated/_approved/admin-predictions")({
  component: AdminPredictionsPage,
});

const STAGES: { value: WcStage; label: string }[] = [
  { value: "group", label: "Group Stage" },
  { value: "r32", label: "Round of 32" },
  { value: "r16", label: "Round of 16" },
  { value: "qf", label: "Quarter-final" },
  { value: "sf", label: "Semi-final" },
  { value: "third", label: "Third Place" },
  { value: "final", label: "Final" },
];

type FormState = {
  id?: string;
  stage: WcStage;
  groupLabel: string;
  homeTeam: string;
  awayTeam: string;
  kickoffLocal: string; // yyyy-MM-ddTHH:mm
};

function toLocalInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => `${n}`.padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function AdminPredictionsPage() {
  const { hasAny } = useAuth();
  const isAdmin = hasAny(["admin", "management"]);

  const [fixtures, setFixtures] = useState<WcFixtureDTO[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<FormState | null>(null);
  const [scoring, setScoring] = useState<WcFixtureDTO | null>(null);
  const [scoreHome, setScoreHome] = useState("");
  const [scoreAway, setScoreAway] = useState("");
  const [busy, setBusy] = useState(false);

  const listFn = useServerFn(listWcFixtures);
  const upsertFn = useServerFn(adminUpsertWcFixture);
  const deleteFn = useServerFn(adminDeleteWcFixture);
  const setResultFn = useServerFn(adminSetWcResult);
  const rescoreFn = useServerFn(adminRescoreAllWc);

  const load = async () => {
    setLoading(true);
    try {
      const data = await listFn();
      setFixtures(data);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  if (!isAdmin) return <Navigate to="/home" />;

  const openCreate = () => {
    setEditing({
      stage: "group",
      groupLabel: "",
      homeTeam: "",
      awayTeam: "",
      kickoffLocal: toLocalInput(new Date().toISOString()),
    });
  };

  const openEdit = (f: WcFixtureDTO) => {
    setEditing({
      id: f.id,
      stage: f.stage,
      groupLabel: f.groupLabel ?? "",
      homeTeam: f.homeTeam,
      awayTeam: f.awayTeam,
      kickoffLocal: toLocalInput(f.kickoffAt),
    });
  };

  const saveFixture = async () => {
    if (!editing) return;
    if (!editing.homeTeam.trim() || !editing.awayTeam.trim()) {
      return toast.error("Both teams are required");
    }
    setBusy(true);
    try {
      await upsertFn({
        data: {
          id: editing.id,
          stage: editing.stage,
          groupLabel: editing.groupLabel.trim() || null,
          homeTeam: editing.homeTeam.trim(),
          awayTeam: editing.awayTeam.trim(),
          kickoffAt: new Date(editing.kickoffLocal).toISOString(),
        },
      });
      toast.success("Fixture saved");
      setEditing(null);
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const removeFixture = async (id: string) => {
    if (!confirm("Delete this fixture and all its predictions?")) return;
    try {
      await deleteFn({ data: { id } });
      toast.success("Deleted");
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Delete failed");
    }
  };

  const openScore = (f: WcFixtureDTO) => {
    setScoring(f);
    setScoreHome(f.homeScore?.toString() ?? "");
    setScoreAway(f.awayScore?.toString() ?? "");
  };

  const saveScore = async (clear = false) => {
    if (!scoring) return;
    setBusy(true);
    try {
      await setResultFn({
        data: {
          fixtureId: scoring.id,
          homeScore: clear ? null : Number(scoreHome),
          awayScore: clear ? null : Number(scoreAway),
        },
      });
      toast.success(clear ? "Score cleared" : "Score saved & points recalculated");
      setScoring(null);
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const rescore = async () => {
    setBusy(true);
    try {
      const res = await rescoreFn();
      toast.success(`Rescored ${(res as any).count ?? 0} fixtures`);
    } catch (e: any) {
      toast.error(e?.message ?? "Rescore failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex-1 overflow-y-auto">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        <header className="relative rounded-3xl overflow-hidden border border-primary/30 shadow-glow bg-gradient-primary p-6 mb-6">
          <div className="absolute inset-0 bg-gradient-to-tr from-background/40 via-transparent to-transparent pointer-events-none" />
          <div className="relative flex items-center gap-3">
            <div className="size-12 rounded-2xl bg-white/15 backdrop-blur grid place-items-center shadow-glow ring-1 ring-white/20">
              <Trophy className="size-6 text-white" />
            </div>
            <div className="flex-1">
              <h1 className="font-display text-2xl sm:text-3xl font-bold text-white">
                World Cup 2026 — Admin
              </h1>
              <p className="text-sm text-white/85">
                Manage fixtures, view the leaderboard and edit settings.
              </p>
            </div>
          </div>
        </header>

        <Tabs defaultValue="fixtures" className="space-y-4">
          <TabsList className="grid grid-cols-3 w-full max-w-md">
            <TabsTrigger value="fixtures"><CalendarDays className="size-4 mr-1.5" />Fixtures</TabsTrigger>
            <TabsTrigger value="leaderboard"><ListOrdered className="size-4 mr-1.5" />Leaderboard</TabsTrigger>
            <TabsTrigger value="settings"><SettingsIcon className="size-4 mr-1.5" />Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="fixtures" className="space-y-4">
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={rescore} disabled={busy}>
                <RefreshCw className="size-4 mr-1.5" /> Rescore all
              </Button>
              <Button onClick={openCreate}>
                <Plus className="size-4 mr-1.5" /> Add fixture
              </Button>
            </div>
            {loading || !fixtures ? (
          <div className="grid place-items-center py-20 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : (
          <div className="rounded-2xl border border-border bg-surface-1 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-surface-2 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2">Kickoff</th>
                  <th className="text-left px-3 py-2">Stage</th>
                  <th className="text-left px-3 py-2">Match</th>
                  <th className="text-center px-3 py-2">Result</th>
                  <th className="text-right px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {fixtures.map((f) => (
                  <tr key={f.id} className="border-t border-border">
                    <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                      {new Date(f.kickoffAt).toLocaleString(undefined, {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {STAGES.find((s) => s.value === f.stage)?.label ?? f.stage}
                      {f.groupLabel ? ` ${f.groupLabel}` : ""}
                    </td>
                    <td className="px-3 py-2">
                      <span className="font-medium">{f.homeTeam}</span>{" "}
                      <span className="text-muted-foreground">vs</span>{" "}
                      <span className="font-medium">{f.awayTeam}</span>
                    </td>
                    <td className="px-3 py-2 text-center font-mono tabular-nums">
                      {f.homeScore !== null && f.awayScore !== null ? (
                        <span className="px-2 py-0.5 rounded bg-primary/15 text-primary font-bold">
                          {f.homeScore} – {f.awayScore}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => openScore(f)}>
                          Score
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => openEdit(f)}>
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => removeFixture(f.id)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!fixtures.length && (
                  <tr>
                    <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                      No fixtures yet — add one above.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
            )}
          </TabsContent>

          <TabsContent value="leaderboard">
            <LeaderboardSection />
          </TabsContent>

          <TabsContent value="settings">
            <SettingsSection />
          </TabsContent>
        </Tabs>
      </div>

      {/* Edit / create fixture dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Edit fixture" : "New fixture"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Stage</Label>
                  <select
                    value={editing.stage}
                    onChange={(e) =>
                      setEditing({ ...editing, stage: e.target.value as WcStage })
                    }
                    className="w-full h-9 px-2 rounded-md bg-surface-2 border border-border text-sm"
                  >
                    {STAGES.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label>Group (optional)</Label>
                  <Input
                    value={editing.groupLabel}
                    onChange={(e) => setEditing({ ...editing, groupLabel: e.target.value })}
                    placeholder="A"
                    maxLength={4}
                  />
                </div>
              </div>
              <div>
                <Label>Home team</Label>
                <Input
                  value={editing.homeTeam}
                  onChange={(e) => setEditing({ ...editing, homeTeam: e.target.value })}
                />
              </div>
              <div>
                <Label>Away team</Label>
                <Input
                  value={editing.awayTeam}
                  onChange={(e) => setEditing({ ...editing, awayTeam: e.target.value })}
                />
              </div>
              <div>
                <Label>Kickoff (your local time)</Label>
                <Input
                  type="datetime-local"
                  value={editing.kickoffLocal}
                  onChange={(e) => setEditing({ ...editing, kickoffLocal: e.target.value })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={saveFixture} disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4 mr-1.5" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Score dialog */}
      <Dialog open={!!scoring} onOpenChange={(o) => !o && setScoring(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Enter final score</DialogTitle>
          </DialogHeader>
          {scoring && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {scoring.homeTeam} vs {scoring.awayTeam}
              </p>
              <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-3">
                <div>
                  <Label className="text-xs">{scoring.homeTeam}</Label>
                  <Input
                    value={scoreHome}
                    onChange={(e) => setScoreHome(e.target.value.replace(/\D/g, "").slice(0, 2))}
                    inputMode="numeric"
                    className="text-center font-display text-lg font-bold"
                  />
                </div>
                <div className="pb-2 text-muted-foreground">–</div>
                <div>
                  <Label className="text-xs">{scoring.awayTeam}</Label>
                  <Input
                    value={scoreAway}
                    onChange={(e) => setScoreAway(e.target.value.replace(/\D/g, "").slice(0, 2))}
                    inputMode="numeric"
                    className="text-center font-display text-lg font-bold"
                  />
                </div>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button
              variant="ghost"
              onClick={() => saveScore(true)}
              disabled={busy}
              className="text-muted-foreground"
            >
              Clear
            </Button>
            <Button variant="ghost" onClick={() => setScoring(null)} disabled={busy}>
              Cancel
            </Button>
            <Button
              onClick={() => saveScore(false)}
              disabled={busy || scoreHome === "" || scoreAway === ""}
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : "Save & rescore"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}

function LeaderboardSection() {
  const fn = useServerFn(getWcLeaderboard);
  const [rows, setRows] = useState<WcLeaderboardRowDTO[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = async () => {
    setErr(null);
    try {
      const r = await fn();
      setRows(r);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load");
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  if (err) return <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{err}</div>;
  if (!rows) return <div className="grid place-items-center py-20 text-muted-foreground"><Loader2 className="size-5 animate-spin" /></div>;
  return (
    <div className="rounded-2xl border border-border bg-surface-1 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-surface-2 text-xs uppercase tracking-wider text-muted-foreground">
        <span>{rows.length} entrants</span>
        <Button size="sm" variant="ghost" onClick={load}><RefreshCw className="size-3.5 mr-1" />Refresh</Button>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-surface-2/60 text-xs uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="text-left px-3 py-2 w-10">#</th>
            <th className="text-left px-3 py-2">Entrant</th>
            <th className="text-center px-3 py-2">Type</th>
            <th className="text-right px-3 py-2">Exact</th>
            <th className="text-right px-3 py-2">Result</th>
            <th className="text-right px-3 py-2">Made</th>
            <th className="text-right px-3 py-2">Points</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.userId} className="border-t border-border">
              <td className="px-3 py-2 text-muted-foreground tabular-nums">{i + 1}</td>
              <td className="px-3 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  {r.avatarUrl ? (
                    <img src={r.avatarUrl} alt="" className="size-7 rounded-full object-cover" />
                  ) : (
                    <div className="size-7 rounded-full bg-surface-2 grid place-items-center text-[10px] font-bold">
                      {(r.displayName ?? r.username ?? "?").slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="truncate font-medium">{r.displayName || r.username || "Anonymous"}</div>
                    {r.username && r.displayName && (
                      <div className="truncate text-[11px] text-muted-foreground">@{r.username}</div>
                    )}
                  </div>
                </div>
              </td>
              <td className="px-3 py-2 text-center text-xs">
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border ${r.isGuest ? "border-muted-foreground/30 text-muted-foreground" : "border-primary/40 text-primary"}`}>
                  {r.isGuest ? "Guest" : "Member"}
                </span>
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{r.exactCount}</td>
              <td className="px-3 py-2 text-right tabular-nums">{r.goalDiffCount + r.resultCount}</td>
              <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{r.predictionsScored}/{r.predictionsMade}</td>
              <td className="px-3 py-2 text-right font-display font-bold tabular-nums text-primary">{r.totalPoints}</td>
            </tr>
          ))}
          {!rows.length && (
            <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">No entrants yet.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function SettingsSection() {
  const getFn = useServerFn(getWcSettings);
  const saveFn = useServerFn(adminSetWcSettings);
  const [data, setData] = useState<WcSettingsDTO | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    getFn().then(setData).catch((e: any) => toast.error(e?.message ?? "Failed to load settings"));
  }, [getFn]);
  const save = async () => {
    if (!data) return;
    setBusy(true);
    try {
      await saveFn({ data });
      toast.success("Settings saved");
    } catch (e: any) {
      toast.error(e?.message ?? "Save failed");
    } finally {
      setBusy(false);
    }
  };
  if (!data) return <div className="grid place-items-center py-20 text-muted-foreground"><Loader2 className="size-5 animate-spin" /></div>;
  return (
    <div className="max-w-xl space-y-4 rounded-2xl border border-border bg-surface-1 p-5">
      <div>
        <Label className="flex items-center gap-1.5"><Star className="size-3.5 text-amber-400" />Prize text</Label>
        <Textarea
          value={data.prizeText}
          onChange={(e) => setData({ ...data, prizeText: e.target.value })}
          rows={3}
          maxLength={500}
          placeholder="e.g. Winner gets a free annual subscription and a Boro Fan Zone trophy badge."
          className="mt-1"
        />
        <p className="text-[11px] text-muted-foreground mt-1">Shown to entrants and visitors on the World Cup 2026 page.</p>
      </div>
      <div>
        <Label>Tagline</Label>
        <Input
          value={data.tagline}
          onChange={(e) => setData({ ...data, tagline: e.target.value })}
          maxLength={200}
          placeholder="e.g. Make your picks before kickoff and climb the leaderboard."
          className="mt-1"
        />
      </div>
      <div className="flex justify-end">
        <Button onClick={save} disabled={busy}>
          {busy ? <Loader2 className="size-4 animate-spin mr-1.5" /> : <Save className="size-4 mr-1.5" />}
          Save settings
        </Button>
      </div>
    </div>
  );
}