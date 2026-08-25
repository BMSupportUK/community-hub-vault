import { createFileRoute, Navigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Trophy, Trash2, Save, RotateCcw } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  getFantasyScoringRules,
  adminSaveFantasyScoringRules,
  type FantasyScoringRule,
} from "@/lib/fantasy.functions";

export const Route = createFileRoute("/_authenticated/_approved/admin-fantasy-scoring")({
  head: () => ({
    meta: [
      { title: "Fantasy Points Scoring — Owner" },
      { name: "description", content: "Change or remove the points awarded for every match stat in the MFC Fantasy Manager." },
      { property: "og:title", content: "Fantasy Points Scoring — Owner" },
      { property: "og:description", content: "Change or remove the points awarded for every match stat in the MFC Fantasy Manager." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminFantasyScoringPage,
});

type Draft = { perN: string; points: string; enabled: boolean };

function AdminFantasyScoringPage() {
  const { hasAny } = useAuth();
  const isAdmin = hasAny(["admin"]);
  const load = useServerFn(getFantasyScoringRules);
  const save = useServerFn(adminSaveFantasyScoringRules);
  const qc = useQueryClient();
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [removals, setRemovals] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const { data: rules, isLoading } = useQuery({
    queryKey: ["fantasy-scoring-rules"],
    queryFn: () => load(),
    enabled: isAdmin,
  });

  useEffect(() => {
    if (!rules) return;
    const next: Record<string, Draft> = {};
    for (const r of rules) next[r.key] = { perN: String(r.perN), points: String(r.points), enabled: r.enabled };
    setDrafts(next);
    setRemovals([]);
  }, [rules]);

  if (!isAdmin) return <Navigate to="/home" />;

  const setField = (key: string, patch: Partial<Draft>) =>
    setDrafts((d) => ({ ...d, [key]: { ...(d[key] ?? { perN: "1", points: "0", enabled: true }), ...patch } }));

  const posLabel = (r: FantasyScoringRule) =>
    r.positions?.length ? r.positions.map((p) => p.toUpperCase()).join(" / ") : "All positions";

  const onSave = async () => {
    const updates: { key: string; perN: number; points: number; enabled: boolean }[] = [];
    for (const r of rules ?? []) {
      if (removals.includes(r.key)) continue;
      const d = drafts[r.key];
      if (!d) continue;
      const perN = parseInt(d.perN, 10);
      const points = parseFloat(d.points);
      if (!Number.isFinite(perN) || perN < 1) return toast.error(`"${r.label}" needs a stat count of 1 or more`);
      if (!Number.isFinite(points)) return toast.error(`"${r.label}" needs a valid points value`);
      updates.push({ key: r.key, perN, points, enabled: d.enabled });
    }
    setSaving(true);
    try {
      const res = await save({ data: { updates, removals } });
      toast.success(`Scoring saved — ${res.rescored} gameweek${res.rescored === 1 ? "" : "s"} re-scored`);
      await qc.invalidateQueries({ queryKey: ["fantasy-scoring-rules"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Could not save scoring");
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
          <Trophy className="size-6 text-primary" /> Fantasy points scoring
        </h1>
        <p className="text-sm text-muted-foreground">
          Set how many points each match stat is worth, how many of that stat it takes to score, and switch any of them off or
          remove them entirely. Saving updates the live game: locked and finished gameweeks are re-scored straight away, and the
          Scoring tab in the game shows the new values. Subs still earn half of every stat value.
        </p>
      </header>

      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading scoring rules…
        </div>
      ) : !rules?.length ? (
        <p className="text-sm text-muted-foreground">No scoring rules found.</p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground border-b border-border">
                  <th className="py-2 px-3 font-semibold">Scoring action</th>
                  <th className="py-2 px-3 font-semibold">Applies to</th>
                  <th className="py-2 px-3 font-semibold whitespace-nowrap">Per how many</th>
                  <th className="py-2 px-3 font-semibold whitespace-nowrap">Points</th>
                  <th className="py-2 px-3 font-semibold">On</th>
                  <th className="py-2 px-3 font-semibold text-right">Remove</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {rules.map((r) => {
                  const d = drafts[r.key] ?? { perN: String(r.perN), points: String(r.points), enabled: r.enabled };
                  const removed = removals.includes(r.key);
                  return (
                    <tr key={r.key} className={removed ? "opacity-50 line-through" : undefined}>
                      <td className="py-2 px-3">
                        <span className="font-medium">{r.label}</span>
                        {r.statColumn && <span className="block text-xs text-muted-foreground">{r.statColumn}</span>}
                      </td>
                      <td className="py-2 px-3 text-xs uppercase text-muted-foreground">{posLabel(r)}</td>
                      <td className="py-2 px-3">
                        <Input
                          type="number"
                          min={1}
                          step={1}
                          className="w-20 tabular-nums"
                          value={d.perN}
                          disabled={removed}
                          onChange={(e) => setField(r.key, { perN: e.target.value })}
                        />
                      </td>
                      <td className="py-2 px-3">
                        <Input
                          type="number"
                          step={0.5}
                          className="w-24 tabular-nums"
                          value={d.points}
                          disabled={removed}
                          onChange={(e) => setField(r.key, { points: e.target.value })}
                        />
                      </td>
                      <td className="py-2 px-3">
                        <Switch
                          checked={d.enabled}
                          disabled={removed}
                          onCheckedChange={(v) => setField(r.key, { enabled: v })}
                        />
                      </td>
                      <td className="py-2 px-3 text-right">
                        <Button
                          variant={removed ? "outline" : "ghost"}
                          size="sm"
                          onClick={() =>
                            setRemovals((list) => (list.includes(r.key) ? list.filter((k) => k !== r.key) : [...list, r.key]))
                          }
                        >
                          {removed ? <RotateCcw className="size-4" /> : <Trash2 className="size-4 text-destructive" />}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={onSave} disabled={saving}>
              {saving ? <Loader2 className="size-4 mr-1 animate-spin" /> : <Save className="size-4 mr-1" />}
              Save scoring
            </Button>
            {removals.length > 0 && (
              <span className="text-xs text-destructive">
                {removals.length} rule{removals.length === 1 ? "" : "s"} will be deleted permanently on save.
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}