import { createFileRoute, Navigate, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Hash } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getFantasySquadNumbers,
  adminSetFantasyShirtNumber,
  type FantasySquadNumberPlayer,
} from "@/lib/fantasy.functions";

export const Route = createFileRoute("/_authenticated/_approved/admin-fantasy-squad-numbers")({
  head: () => ({
    meta: [
      { title: "Fantasy squad numbers — Admin" },
      { name: "description", content: "Set the squad number for every Middlesbrough player in the MFC Fantasy Manager." },
      { property: "og:title", content: "Fantasy squad numbers — Admin" },
      { property: "og:description", content: "Set the squad number for every Middlesbrough player in the MFC Fantasy Manager." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminFantasySquadNumbersPage,
});

const LEVEL_LABEL: Record<string, string> = { first: "First team", u21: "U21", u18: "U18" };
const POS_LABEL: Record<string, string> = { gk: "GK", def: "DEF", mid: "MID", fwd: "FWD" };
const LEVEL_ORDER = ["first", "u21", "u18"];

function AdminFantasySquadNumbersPage() {
  const { hasAny } = useAuth();
  const isAdmin = hasAny(["admin", "management"]);
  const load = useServerFn(getFantasySquadNumbers);
  const save = useServerFn(adminSetFantasyShirtNumber);
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const { data, isLoading } = useQuery({
    queryKey: ["fantasy-squad-numbers"],
    queryFn: () => load(),
    enabled: isAdmin,
  });

  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = (data ?? []).filter((p) => !q || p.name.toLowerCase().includes(q));
    return LEVEL_ORDER.map((lvl) => ({
      level: lvl,
      players: list.filter((p) => p.squadLevel === lvl),
    })).filter((g) => g.players.length > 0);
  }, [data, search]);

  if (!isAdmin) return <Navigate to="/home" />;

  const draftOf = (p: FantasySquadNumberPlayer) =>
    drafts[p.id] ?? (p.shirtNumber == null ? "" : String(p.shirtNumber));

  const apply = async (p: FantasySquadNumberPlayer) => {
    const raw = draftOf(p).trim();
    let num: number | null = null;
    const isDash = /^[-–—]+$/.test(raw);
    if (raw && !isDash) {
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 1 || n > 99) {
        toast.error("Squad number must be a whole number between 1 and 99, or - for no number");
        return;
      }
      num = n;
    }
    setBusy(p.id);
    try {
      await save({ data: { playerId: p.id, shirtNumber: num } });
      toast.success(num == null ? `Cleared ${p.name}'s squad number` : `${p.name} is now No${num}`);
      setDrafts((d) => {
        const next = { ...d };
        delete next[p.id];
        return next;
      });
      await qc.invalidateQueries({ queryKey: ["fantasy-squad-numbers"] });
      await qc.invalidateQueries({ queryKey: ["fantasy"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Could not save");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link to="/admin">
            <ArrowLeft className="mr-1 size-4" /> Admin
          </Link>
        </Button>
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <Hash className="size-5 text-primary" /> Fantasy squad numbers
        </h1>
      </div>

      <p className="text-sm text-muted-foreground">
        Every player in the MFC Fantasy Manager pool. Set or change a squad number here and it is
        locked — the automatic club squad sync will never overwrite it. Leave blank for no number.
      </p>

      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search players…"
        className="max-w-sm"
      />

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading squad…
        </div>
      ) : (
        <div className="space-y-8">
          {groups.map((g) => (
            <section key={g.level} className="space-y-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {LEVEL_LABEL[g.level] ?? g.level} ({g.players.length})
              </h2>
              <ul className="divide-y divide-border rounded-lg border border-border">
                {g.players.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center gap-3 p-3">
                    <span className="min-w-10 rounded bg-muted px-2 py-1 text-center text-sm font-bold tabular-nums">
                      {p.shirtNumber ?? "–"}
                    </span>
                    <span className="flex-1 min-w-40 text-sm font-medium">
                      {p.name}
                      <span className="ml-2 text-xs text-muted-foreground">
                        {POS_LABEL[p.position] ?? p.position}
                        {p.status === "loaned_out" ? " · on loan" : ""}
                        {p.shirtNumberLocked ? " · locked" : ""}
                      </span>
                    </span>
                    <Input
                      value={draftOf(p)}
                      onChange={(e) => setDrafts((d) => ({ ...d, [p.id]: e.target.value }))}
                      inputMode="numeric"
                      placeholder="No. or -"
                      className="w-20"
                    />
                    <Button size="sm" disabled={busy === p.id} onClick={() => apply(p)}>
                      {busy === p.id ? <Loader2 className="size-4 animate-spin" /> : "Save"}
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}