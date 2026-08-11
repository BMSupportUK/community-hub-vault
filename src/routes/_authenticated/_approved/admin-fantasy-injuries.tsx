import { createFileRoute, Navigate, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Cross, RefreshCw } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getFantasyInjuries,
  adminSetFantasyInjury,
  adminSyncFantasyInjuries,
  adminSetFantasyIn25Squad,
  type FantasyInjuryPlayer,
} from "@/lib/fantasy.functions";

export const Route = createFileRoute("/_authenticated/_approved/admin-fantasy-injuries")({
  head: () => ({
    meta: [
      { title: "Fantasy injuries — Admin" },
      { name: "description", content: "Flag injured, doubtful or suspended Middlesbrough players in the MFC Fantasy Manager." },
      { property: "og:title", content: "Fantasy injuries — Admin" },
      { property: "og:description", content: "Flag injured, doubtful or suspended Middlesbrough players in the MFC Fantasy Manager." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminFantasyInjuriesPage,
});

const LEVEL_LABEL: Record<string, string> = { first: "First team", u21: "U21", u18: "U18" };
const STATUSES = ["none", "doubtful", "out", "suspended"] as const;
const STATUS_LABEL: Record<string, string> = {
  none: "Fit",
  doubtful: "Doubtful",
  out: "Injured / out",
  suspended: "Suspended",
};

function AdminFantasyInjuriesPage() {
  const { hasAny } = useAuth();
  const isAdmin = hasAny(["admin", "management"]);
  const load = useServerFn(getFantasyInjuries);
  const save = useServerFn(adminSetFantasyInjury);
  const sync = useServerFn(adminSyncFantasyInjuries);
  const setIn25 = useServerFn(adminSetFantasyIn25Squad);
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, { note: string; ret: string }>>({});

  const { data, isLoading } = useQuery({
    queryKey: ["fantasy-injuries"],
    queryFn: () => load(),
    enabled: isAdmin,
  });

  const players = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = data ?? [];
    return q ? list.filter((p) => p.name.toLowerCase().includes(q)) : list;
  }, [data, search]);

  if (!isAdmin) return <Navigate to="/home" />;

  const draftOf = (p: FantasyInjuryPlayer) =>
    drafts[p.id] ?? { note: p.injuryNote ?? "", ret: p.injuryReturn ?? "" };

  const apply = async (p: FantasyInjuryPlayer, status: (typeof STATUSES)[number]) => {
    const d = draftOf(p);
    setBusy(p.id);
    try {
      await save({ data: { playerId: p.id, injuryStatus: status, note: d.note || null, expectedReturn: d.ret || null } });
      toast.success(status === "none" ? `${p.name} marked fit` : `${p.name} marked ${STATUS_LABEL[status]?.toLowerCase()}`);
      await qc.invalidateQueries({ queryKey: ["fantasy-injuries"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Could not save");
    } finally {
      setBusy(null);
    }
  };

  const runSync = async () => {
    setSyncing(true);
    try {
      await sync();
      toast.success("Pulled the latest injuries from the EFL Fantasy feed");
      await qc.invalidateQueries({ queryKey: ["fantasy-injuries"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const toggle25 = async (p: FantasyInjuryPlayer) => {
    setBusy(p.id);
    try {
      await setIn25({ data: { playerId: p.id, in25Squad: !p.in25Squad } });
      toast.success(
        p.in25Squad ? `${p.name} removed from the 25-man squad` : `${p.name} named in the 25-man squad`,
      );
      await qc.invalidateQueries({ queryKey: ["fantasy-injuries"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Could not save");
    } finally {
      setBusy(null);
    }
  };

  const unusedRunSync = async () => {
    setSyncing(true);
    try {
      await sync();
      toast.success("Pulled the latest injuries from the EFL Fantasy feed");
      await qc.invalidateQueries({ queryKey: ["fantasy-injuries"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link to="/admin">
            <ArrowLeft className="size-4 mr-1" /> Admin
          </Link>
        </Button>
      </div>
      <header className="space-y-1">
        <h1 className="font-display text-2xl flex items-center gap-2">
          <Cross className="size-6 text-destructive" /> Fantasy injuries
        </h1>
        <p className="text-sm text-muted-foreground">
          Flag players as doubtful, injured or suspended. An icon shows on the pitch view and in the player picker —
          managers can still pick them, at their own risk. Anything you set here overrides the automatic feed.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search players…"
          className="max-w-xs"
        />
        <Button variant="outline" size="sm" disabled={syncing} onClick={runSync}>
          {syncing ? <Loader2 className="size-4 mr-1 animate-spin" /> : <RefreshCw className="size-4 mr-1" />}
          Sync from EFL feed
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading squad…
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {players.map((p) => {
            const d = draftOf(p);
            return (
              <div key={p.id} className="rounded-xl border border-border p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-medium">{p.name}</div>
                    <div className="text-xs uppercase text-muted-foreground">
                      {p.position} · {LEVEL_LABEL[p.squadLevel] ?? p.squadLevel}
                    </div>
                  </div>
                  <span
                    className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                      p.injuryStatus === "none"
                        ? "border-border text-muted-foreground"
                        : p.injuryStatus === "doubtful"
                          ? "border-amber-500/50 bg-amber-500/10 text-amber-500"
                          : "border-destructive/50 bg-destructive/10 text-destructive"
                    }`}
                  >
                    {STATUS_LABEL[p.injuryStatus]}
                    {p.injurySource ? ` · ${p.injurySource}` : ""}
                  </span>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Input
                    value={d.note}
                    onChange={(e) => setDrafts((s) => ({ ...s, [p.id]: { ...d, note: e.target.value } }))}
                    placeholder="What's wrong (e.g. hamstring)"
                    className="h-9"
                  />
                  <Input
                    value={d.ret}
                    onChange={(e) => setDrafts((s) => ({ ...s, [p.id]: { ...d, ret: e.target.value } }))}
                    placeholder="Expected back (e.g. mid-Feb)"
                    className="h-9"
                  />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {STATUSES.map((s) => (
                    <Button
                      key={s}
                      size="sm"
                      variant={p.injuryStatus === s ? "default" : "outline"}
                      disabled={busy === p.id}
                      onClick={() => apply(p, s)}
                    >
                      {STATUS_LABEL[s]}
                    </Button>
                  ))}
                </div>
              </div>
            );
          })}
          {!players.length && <p className="text-sm text-muted-foreground">No players match that search.</p>}
        </div>
      )}
    </div>
  );
}