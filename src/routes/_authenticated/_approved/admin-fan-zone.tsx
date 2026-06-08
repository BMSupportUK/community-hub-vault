import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Check,
  X,
  RotateCcw,
  Trophy,
  Loader2,
  Search,
  ArrowUpDown,
  MoreHorizontal,
  UserCog,
  Users,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useFanZoneMembership } from "@/hooks/use-fan-zone";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import bgAsset from "@/assets/fanzone-chat-bg.png.asset.json";

export const Route = createFileRoute("/_authenticated/_approved/admin-fan-zone")({
  component: AdminFanZonePage,
});

type Status = "pending" | "approved" | "rejected" | "revoked";
type Row = {
  user_id: string;
  status: Status;
  requested_at: string;
  decided_at: string | null;
  reason: string | null;
  note: string | null;
  fan_alias: string | null;
  fan_avatar_url: string | null;
};
type Profile = {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
};

function AdminFanZonePage() {
  const { user, hasAny } = useAuth();
  const isAdmin = hasAny(["admin", "management"]);
  const info = useFanZoneMembership(user?.id ?? null);
  const isMember = info?.status === "approved" || hasAny(["boro_fan_zone_member"]);
  const canView = isAdmin || isMember;
  type Tab = "all" | Status;
  const [tab, setTab] = useState<Tab>(isAdmin ? "all" : "approved");
  const [rows, setRows] = useState<Row[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<"name" | "since" | "requested">("requested");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const load = async () => {
    if (isAdmin) {
      const { data } = await supabase
        .from("fan_zone_members")
          .select("user_id, status, requested_at, decided_at, reason, note, fan_alias, fan_avatar_url")
        .order("requested_at", { ascending: false });
      const list = (data ?? []) as Row[];
      setRows(list);
      const ids = Array.from(new Set(list.map((r) => r.user_id)));
      if (ids.length) {
        const { data: ps } = await supabase
          .from("profiles")
          .select("id, display_name, username, avatar_url")
          .in("id", ids);
        const map: Record<string, Profile> = {};
        (ps ?? []).forEach((p) => (map[(p as Profile).id] = p as Profile));
        setProfiles(map);
      }
    } else {
      const { data } = await (supabase.rpc as unknown as (fn: string) => Promise<{ data: unknown }>)(
        "list_fan_zone_approved_members",
      );
      const arr = (data ?? []) as Array<{
        user_id: string;
        status: Status;
        requested_at: string;
        decided_at: string | null;
        fan_alias: string | null;
        fan_avatar_url: string | null;
      }>;
      setRows(arr.map((r) => ({
        user_id: r.user_id,
        status: r.status,
        requested_at: r.requested_at,
        decided_at: r.decided_at,
        reason: null,
        note: null,
        fan_alias: r.fan_alias,
        fan_avatar_url: r.fan_avatar_url,
      })));
      const map: Record<string, Profile> = {};
      arr.forEach((r) => {
        map[r.user_id] = {
          id: r.user_id,
          display_name: r.fan_alias,
          username: null,
          avatar_url: r.fan_avatar_url,
        };
      });
      setProfiles(map);
    }
  };

  useEffect(() => {
    if (!canView) return;
    void load();
    if (!isAdmin) return;
    const ch = supabase
      .channel("admin-fan-zone-feed")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "fan_zone_members" },
        () => void load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [canView, isAdmin]);

  if (!canView) return <Navigate to="/home" />;

  const decide = async (userId: string, status: "approved" | "rejected" | "revoked") => {
    setBusy(userId);
    const { error } = await supabase
      .from("fan_zone_members")
      .update({
        status,
        decided_at: new Date().toISOString(),
        decided_by: user?.id ?? null,
      })
      .eq("user_id", userId);
    setBusy(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(
      status === "approved"
        ? "Approved — welcome to the zone."
        : status === "rejected"
          ? "Request declined."
          : "Access revoked.",
    );
    void load();
  };

  const counts = useMemo(
    () => ({
      all: rows.length,
      pending: rows.filter((r) => r.status === "pending").length,
      approved: rows.filter((r) => r.status === "approved").length,
      rejected: rows.filter((r) => r.status === "rejected").length,
      revoked: rows.filter((r) => r.status === "revoked").length,
    }),
    [rows],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const dir = sortDir === "asc" ? 1 : -1;
    return rows
      .filter((r) => (tab === "all" ? true : r.status === tab))
      .filter((r) => {
        if (!q) return true;
        const p = profiles[r.user_id];
        return (
          (p?.display_name ?? "").toLowerCase().includes(q) ||
          (p?.username ?? "").toLowerCase().includes(q) ||
          r.user_id.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        if (sortKey === "name") {
          const an = (profiles[a.user_id]?.display_name || profiles[a.user_id]?.username || "").toLowerCase();
          const bn = (profiles[b.user_id]?.display_name || profiles[b.user_id]?.username || "").toLowerCase();
          return an < bn ? -dir : an > bn ? dir : 0;
        }
        if (sortKey === "since") {
          const at = new Date(a.decided_at ?? a.requested_at).getTime();
          const bt = new Date(b.decided_at ?? b.requested_at).getTime();
          return (at - bt) * dir;
        }
        return (new Date(a.requested_at).getTime() - new Date(b.requested_at).getTime()) * dir;
      });
  }, [rows, profiles, tab, search, sortKey, sortDir]);

  const toggleSort = (key: "name" | "since" | "requested") => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "name" ? "asc" : "desc");
    }
  };

  return (
    <main
      className="flex-1 w-full min-w-0 min-h-full self-stretch overflow-y-auto bg-cover bg-center bg-no-repeat bg-fixed"
      style={{ backgroundImage: `linear-gradient(to bottom, rgba(10,8,16,0.78), rgba(10,8,16,0.9)), url(${bgAsset.url})` }}
    >
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6">
        <div className="mb-4 flex items-center gap-4 flex-wrap">
          <Link to="/forum" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" /> Back to Boro Fan Zone
          </Link>
          {isAdmin && (
            <Link to="/admin" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="size-4" /> Back to Admin Dashboard
            </Link>
          )}
        </div>

        {/* Top tabs strip */}
        <div className="flex items-center gap-6 border-b border-border pb-3 mb-6 overflow-x-auto">
          <div className="flex items-center gap-2 shrink-0 text-sm font-semibold">
            <Users className="size-4 text-muted-foreground" />
            <span>Members</span>
            {counts.pending > 0 && (
              <span className="ml-1 size-2 rounded-full bg-rose-500" aria-label={`${counts.pending} pending`} />
            )}
          </div>
          {isAdmin && (
            <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
              <TabsList className="bg-transparent p-0 h-auto gap-1">
                <TabsTrigger value="all" className="data-[state=active]:bg-surface-2 data-[state=active]:text-foreground rounded-md px-3 py-1.5 text-sm">
                  All Members
                </TabsTrigger>
                <TabsTrigger value="pending" className="data-[state=active]:bg-surface-2 data-[state=active]:text-foreground rounded-md px-3 py-1.5 text-sm">
                  Pending{counts.pending > 0 && <span className="ml-1.5 text-xs text-rose-400">{counts.pending}</span>}
                </TabsTrigger>
                <TabsTrigger value="rejected" className="data-[state=active]:bg-surface-2 data-[state=active]:text-foreground rounded-md px-3 py-1.5 text-sm">
                  Rejected
                </TabsTrigger>
                <TabsTrigger value="approved" className="data-[state=active]:bg-surface-2 data-[state=active]:text-foreground rounded-md px-3 py-1.5 text-sm">
                  Approved
                </TabsTrigger>
              </TabsList>
            </Tabs>
          )}
        </div>

        {/* Toolbar */}
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Trophy className="size-5 text-amber-500" />
            <h1 className="text-xl font-semibold">
              {tab === "all" ? "Recent Members" : tab.charAt(0).toUpperCase() + tab.slice(1) + " Members"}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="size-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by username or ID"
                className="h-9 pl-8 w-[260px] bg-surface-1 border-border"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-9"
              onClick={() => toggleSort(sortKey)}
              title={`Sort ${sortDir === "asc" ? "ascending" : "descending"}`}
            >
              <ArrowUpDown className="size-3.5 mr-1.5" /> Sort
            </Button>
          </div>
        </div>

        {/* Table */}
        <div className="rounded-xl border border-border bg-surface-1 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border bg-surface-2/40">
                  <th className="text-left font-semibold px-5 py-3">
                    <button onClick={() => toggleSort("name")} className="inline-flex items-center gap-1 hover:text-foreground">
                      Name <ArrowUpDown className="size-3" />
                    </button>
                  </th>
                  <th className="text-left font-semibold px-5 py-3">
                    <button onClick={() => toggleSort("since")} className="inline-flex items-center gap-1 hover:text-foreground">
                      Member Since <ArrowUpDown className="size-3" />
                    </button>
                  </th>
                  <th className="text-left font-semibold px-5 py-3">
                    <button onClick={() => toggleSort("requested")} className="inline-flex items-center gap-1 hover:text-foreground">
                      Requested <ArrowUpDown className="size-3" />
                    </button>
                  </th>
                  {isAdmin && <th className="text-left font-semibold px-5 py-3">Reason</th>}
                  {isAdmin && <th className="text-left font-semibold px-5 py-3">Status</th>}
                  {isAdmin && <th className="w-12 px-3" />}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={isAdmin ? 6 : 3} className="text-center text-muted-foreground py-16">
                      No members in this view.
                    </td>
                  </tr>
                ) : (
                  filtered.map((r) => {
                    const name = r.fan_alias || "Boro Fan";
                    const avatar = r.fan_avatar_url;
                    return (
                      <tr key={r.user_id} className="border-b border-border/60 last:border-0 hover:bg-surface-2/30">
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3 min-w-0">
                            {avatar ? (
                              <img src={avatar} alt={name} className="size-9 rounded-full object-cover" />
                            ) : (
                              <div className="size-9 rounded-full bg-gradient-to-br from-rose-600 to-amber-600 grid place-items-center text-white text-xs font-bold">
                                {name.slice(0, 1).toUpperCase()}
                              </div>
                            )}
                            <div className="min-w-0">
                              <Link
                                to="/fanzone/u/$userId"
                                params={{ userId: r.user_id }}
                                className="font-medium hover:underline truncate block max-w-[220px]"
                              >
                                {name}
                              </Link>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3 text-muted-foreground">
                          {formatAgo(r.decided_at ?? r.requested_at)}
                        </td>
                        <td className="px-5 py-3 text-muted-foreground">
                          {formatAgo(r.requested_at)}
                        </td>
                        {isAdmin && (
                          <td className="px-5 py-3 max-w-[280px]">
                            {r.reason ? (
                              <span className="text-xs text-muted-foreground line-clamp-2" title={r.reason}>
                                {r.reason}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground/60">—</span>
                            )}
                          </td>
                        )}
                        {isAdmin && (
                          <td className="px-5 py-3">
                            <StatusPill status={r.status} />
                          </td>
                        )}
                        {isAdmin && (
                          <td className="px-3 py-3 text-right">
                            <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="size-8" disabled={busy === r.user_id}>
                                {busy === r.user_id ? (
                                  <Loader2 className="size-4 animate-spin" />
                                ) : (
                                  <MoreHorizontal className="size-4" />
                                )}
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuLabel className="text-xs flex items-center gap-1.5">
                                <UserCog className="size-3.5" /> Manage access
                              </DropdownMenuLabel>
                              <DropdownMenuSeparator />
                              {r.status !== "approved" && (
                                <DropdownMenuItem onClick={() => decide(r.user_id, "approved")}>
                                  <Check className="size-4 mr-2 text-emerald-500" /> Approve
                                </DropdownMenuItem>
                              )}
                              {r.status !== "rejected" && r.status !== "approved" && (
                                <DropdownMenuItem onClick={() => decide(r.user_id, "rejected")}>
                                  <X className="size-4 mr-2 text-rose-500" /> Reject
                                </DropdownMenuItem>
                              )}
                              {r.status === "approved" && (
                                <DropdownMenuItem onClick={() => decide(r.user_id, "revoked")}>
                                  <RotateCcw className="size-4 mr-2 text-rose-500" /> Revoke
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                            </DropdownMenu>
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <div className="px-5 py-3 text-xs text-muted-foreground border-t border-border bg-surface-2/30">
            Showing <span className="font-medium text-foreground">{filtered.length}</span> {filtered.length === 1 ? "member" : "members"}
          </div>
        </div>
      </div>
    </main>
  );
}

function StatusPill({ status }: { status: Status }) {
  const map: Record<Status, { label: string; cls: string; dot: string }> = {
    approved: { label: "Approved", cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30", dot: "bg-emerald-500" },
    pending: { label: "Pending", cls: "bg-amber-500/10 text-amber-400 border-amber-500/30", dot: "bg-amber-500" },
    rejected: { label: "Rejected", cls: "bg-rose-500/10 text-rose-400 border-rose-500/30", dot: "bg-rose-500" },
    revoked: { label: "Revoked", cls: "bg-muted/40 text-muted-foreground border-border", dot: "bg-muted-foreground" },
  };
  const m = map[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${m.cls}`}>
      <span className={`size-1.5 rounded-full ${m.dot}`} /> {m.label}
    </span>
  );
}

function formatAgo(iso: string | null | undefined): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const diff = Math.max(0, Date.now() - then);
  const d = Math.floor(diff / 86400000);
  if (d < 1) {
    const h = Math.floor(diff / 3600000);
    if (h < 1) {
      const m = Math.floor(diff / 60000);
      return m < 1 ? "just now" : `${m} minute${m === 1 ? "" : "s"} ago`;
    }
    return `${h} hour${h === 1 ? "" : "s"} ago`;
  }
  if (d < 30) return `${d} day${d === 1 ? "" : "s"} ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo} month${mo === 1 ? "" : "s"} ago`;
  const y = Math.floor(d / 365);
  return `${y} year${y === 1 ? "" : "s"} ago`;
}