import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Check, Loader2, RefreshCw, Trash2, Flag, Ban } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatLastSeen } from "@/lib/relative-time";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/_approved/admin-reports")({
  component: AdminReportsPage,
});

type Report = {
  id: string;
  kind: "forum_post" | "dm_message";
  target_id: string;
  reporter_id: string;
  reporter_name: string;
  reason: string;
  status: "pending" | "reviewed" | "dismissed";
  created_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  notes: string | null;
  target_preview: string | null;
  target_author_id: string | null;
  target_author_name: string | null;
};

function AdminReportsPage() {
  const { hasAny } = useAuth();
  const allowed = hasAny(["admin", "management", "moderator", "boro_fan_zone_moderator"]);
  const [tab, setTab] = useState<MainTab>("reports");
  const [status, setStatus] = useState<"pending" | "reviewed" | "dismissed">("pending");
  const [rows, setRows] = useState<Report[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [mutes, setMutes] = useState<Sanction[] | null>(null);
  const [bans, setBans] = useState<Sanction[] | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [log, setLog] = useState<ModAction[] | null>(null);
  const [logUser, setLogUser] = useState<{ id: string; kind: "mute" | "ban" } | null>(null);
  const [confirmLift, setConfirmLift] = useState<{ kind: "mute" | "ban"; row: Sanction } | null>(null);

  const load = async () => {
    setRows(null);
    const { data, error } = await supabase.rpc("list_content_reports", { _status: status });
    if (error) {
      toast.error("Couldn't load reports", { description: error.message });
      setRows([]);
      return;
    }
    setRows((data ?? []) as Report[]);
  };

  const loadNames = useCallback(async (ids: string[]) => {
    const missing = Array.from(new Set(ids.filter(Boolean)));
    if (!missing.length) return;
    const [fz, profs] = await Promise.all([
      supabase.from("fan_zone_members").select("user_id, fan_alias").in("user_id", missing),
      supabase.from("profiles").select("id, display_name, username").in("id", missing),
    ]);
    const map: Record<string, string> = {};
    ((profs.data ?? []) as Array<{ id: string; display_name: string | null; username: string | null }>).forEach((p) => {
      const n = p.display_name ?? p.username;
      if (n) map[p.id] = n;
    });
    ((fz.data ?? []) as Array<{ user_id: string; fan_alias: string | null }>).forEach((r) => {
      if (r.fan_alias) map[r.user_id] = r.fan_alias;
    });
    setNames((prev) => ({ ...map, ...prev }));
  }, []);

  const loadLog = useCallback(async (userId: string, kind: "mute" | "ban", since: string) => {
    setLog(null);
    // Only notes tied to this one mute/ban: nothing from before it started.
    const from = new Date(Date.parse(since) - 5000).toISOString();
    const actions =
      kind === "mute" ? ["mute", "unmute"] : ["ban", "unban", "appeal", "appeal_reply"];
    const { data, error } = await supabase
      .from("fan_zone_mod_actions")
      .select("id, user_id, actor_id, action, reason, expires_at, created_at")
      .eq("user_id", userId)
      .in("action", actions)
      .gte("created_at", from)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) {
      toast.error("Couldn't load the moderation log", { description: error.message });
      setLog([]);
      return;
    }
    const list = (data ?? []) as ModAction[];
    setLog(list);
    void loadNames(list.flatMap((r) => [r.user_id, r.actor_id ?? ""]));
  }, [loadNames]);


  const loadSanctions = useCallback(async () => {
    const nowIso = new Date().toISOString();
    setMutes(null);
    setBans(null);
    const [m, b] = await Promise.all([
      supabase
        .from("fan_zone_mutes")
        .select("id, user_id, reason, expires_at, created_at")
        .gt("expires_at", nowIso)
        .order("created_at", { ascending: false }),
      supabase
        .from("fan_zone_bans")
        .select("id, user_id, reason, expires_at, created_at")
        .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
        .order("created_at", { ascending: false }),
    ]);
    const mList = (m.data ?? []) as Sanction[];
    const bList = (b.data ?? []) as Sanction[];
    setMutes(mList);
    setBans(bList);
    void loadNames([...mList, ...bList].map((r) => r.user_id));
  }, [loadNames]);

  useEffect(() => {
    if (allowed && tab === "reports") void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, allowed, tab]);

  useEffect(() => {
    if (allowed && (tab === "mutes" || tab === "bans")) void loadSanctions();
  }, [allowed, tab, loadSanctions]);

  if (!allowed) return <Navigate to="/forum" />;

  const resolve = async (id: string, newStatus: "reviewed" | "dismissed") => {
    setBusyId(id);
    const { error } = await supabase.rpc("resolve_content_report", { _id: id, _status: newStatus });
    setBusyId(null);
    if (error) return toast.error("Couldn't update", { description: error.message });
    toast.success(newStatus === "reviewed" ? "Marked reviewed" : "Dismissed");
    void load();
  };

  const lift = async (kind: "mute" | "ban", row: Sanction) => {
    setBusyId(row.id);
    const { error } = await supabase.rpc(kind === "mute" ? "fan_zone_unmute" : "fan_zone_unban", {
      _user_id: row.user_id,
    });
    setBusyId(null);
    setConfirmLift(null);
    if (error) return toast.error("Couldn't lift", { description: error.message });
    toast.success(kind === "mute" ? "Mute lifted" : "Ban lifted");
    void loadSanctions();
  };

  const logList = () => {
    if (log === null)
      return (
        <div className="grid place-items-center py-12 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
        </div>
      );
    if (!log.length)
      return <p className="text-sm text-muted-foreground text-center py-12">Nothing logged for this one yet.</p>;
    return (
      <ul className="space-y-2">
        {log.map((r) => {
          const isAppeal = r.action === "appeal" || r.action === "appeal_reply";
          const lifted = r.action === "unmute" || r.action === "unban" || r.action === "appeal_reply";
          const Icon =
            r.action === "mute"
              ? VolumeX
              : r.action === "unmute"
                ? Volume2
                : r.action === "ban"
                  ? Gavel
                  : r.action === "appeal"
                    ? MailQuestion
                    : r.action === "appeal_reply"
                      ? Inbox
                      : ShieldCheck;

          return (
            <li key={r.id} className="rounded-xl border border-border bg-surface-1 p-3 space-y-1.5 shadow-soft">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span
                  className={`rounded-full px-2 py-0.5 font-semibold inline-flex items-center gap-1 border ${
                    isAppeal
                      ? "bg-amber-500/15 border-amber-400/40 text-amber-300"
                      : lifted
                      ? "bg-emerald-500/15 border-emerald-400/40 text-emerald-300"
                      : "bg-[#E11B22]/15 border-[#E11B22]/40 text-[#E11B22]"
                  }`}
                >
                  <Icon className="size-3" />
                  {ACTION_LABEL[r.action]}
                </span>
                <strong className="text-foreground text-sm">{names[r.user_id] ?? "Fan Zone member"}</strong>
                <span className="text-muted-foreground">
                  by {r.actor_id ? (names[r.actor_id] ?? "staff") : "system"} · {formatLastSeen(r.created_at)}
                  {isAppeal
                    ? ""
                    : !lifted
                    ? r.expires_at
                      ? ` · until ${new Date(r.expires_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}`
                      : " · permanent"
                    : ""}
                </span>
              </div>
              {r.reason && <div className="text-sm text-muted-foreground">{r.reason}</div>}
              {isAppeal && (
                <Button asChild variant="ghost" size="sm" className="-ml-2 h-7 px-2 text-xs">
                  <Link to="/fan-zone-appeals" onClick={() => setLogUser(null)}>
                    Open appeal
                  </Link>
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    );
  };

  const sanctionList = (kind: "mute" | "ban", list: Sanction[] | null) => {
    if (list === null)
      return (
        <div className="grid place-items-center py-12 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
        </div>
      );
    if (!list.length)
      return (
        <p className="text-sm text-muted-foreground text-center py-12">
          No active {kind === "mute" ? "mutes" : "bans"}.
        </p>
      );
    return (
      <ul className="space-y-3">
        {list.map((r) => (
          <li key={r.id} className="rounded-xl border border-border bg-surface-1 p-4 space-y-3 shadow-soft">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full bg-[#E11B22]/15 border border-[#E11B22]/40 text-[#E11B22] px-2 py-0.5 font-semibold inline-flex items-center gap-1">
                {kind === "mute" ? <VolumeX className="size-3" /> : <Gavel className="size-3" />}
                {kind === "mute" ? "Muted" : "Banned"}
              </span>
              <strong className="text-foreground text-sm">{names[r.user_id] ?? "Fan Zone member"}</strong>
              <span className="text-muted-foreground">
                {untilLabel(r.expires_at)} · started {formatLastSeen(r.created_at)}
              </span>
            </div>
            <div className="rounded-lg bg-surface-2/40 border border-border/60 px-3 py-2 text-sm">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Reason</div>
              {r.reason}
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setLogUser({ id: r.user_id, kind });
                  void loadLog(r.user_id, kind, r.created_at);
                }}
              >
                <ScrollText className="size-3.5 mr-1" />
                Log
              </Button>
              <Button size="sm" variant="outline" disabled={busyId === r.id} onClick={() => setConfirmLift({ kind, row: r })}>
                {busyId === r.id ? <Loader2 className="size-3.5 animate-spin mr-1" /> : <Check className="size-3.5 mr-1" />}
                Lift {kind}
              </Button>
            </div>
          </li>
        ))}
      </ul>
    );
  };

  return (
    <main className="flex-1 w-full min-w-0 min-h-full self-stretch overflow-y-auto">
      <div className="w-full px-4 sm:px-6 py-6 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <Button asChild variant="ghost" size="sm" className="-ml-2">
            <Link to="/forum"><ArrowLeft className="size-4 mr-1" />Boro Fan Zone</Link>
          </Button>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                tab === "reports" ? void load() : void loadSanctions()
              }
            >
              <RefreshCw className="size-4 mr-1" />Refresh
            </Button>
          </div>
        </div>

        <header className="flex items-center gap-2">
          <Flag className="size-5 text-[#E11B22]" />
          <h1 className="font-display font-bold text-xl">Moderation centre</h1>
        </header>

        <Tabs value={tab} onValueChange={(v) => setTab(v as MainTab)}>
          <TabsList>
            <TabsTrigger value="reports">Reports</TabsTrigger>
            <TabsTrigger value="mutes">Mutes</TabsTrigger>
            <TabsTrigger value="bans">Bans</TabsTrigger>
          </TabsList>
        </Tabs>

        {tab === "mutes" && sanctionList("mute", mutes)}
        {tab === "bans" && sanctionList("ban", bans)}

        <Dialog open={!!logUser} onOpenChange={(o) => { if (!o) setLogUser(null); }}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ScrollText className="size-4 text-[#E11B22]" />
                {logUser
                  ? `${names[logUser.id] ?? "Fan Zone member"} — this ${logUser.kind}`
                  : "Log"}
              </DialogTitle>
              <DialogDescription>
                Notes for this one {logUser?.kind === "mute" ? "mute" : "ban"} only — who set it, any appeal
                and reply, and whether it was lifted early.
              </DialogDescription>
            </DialogHeader>
            <div className="max-h-[60vh] overflow-y-auto pr-1">{logList()}</div>
          </DialogContent>
        </Dialog>

        <AlertDialog open={!!confirmLift} onOpenChange={(o) => { if (!o) setConfirmLift(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Lift the {confirmLift?.kind === "ban" ? "ban" : "mute"} on{" "}
                {confirmLift ? (names[confirmLift.row.user_id] ?? "this member") : "this member"} early?
              </AlertDialogTitle>
              <AlertDialogDescription>
                {confirmLift?.kind === "ban"
                  ? "They'll get straight back into the Fan Zone before the ban was due to end."
                  : "They'll be able to post again straight away, before the mute was due to end."}{" "}
                This is recorded in the moderation log against your name.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={!!busyId}>Keep it in place</AlertDialogCancel>
              <AlertDialogAction
                disabled={!!busyId}
                onClick={(e) => {
                  e.preventDefault();
                  if (confirmLift) void lift(confirmLift.kind, confirmLift.row);
                }}
              >
                Lift {confirmLift?.kind === "ban" ? "ban" : "mute"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {tab === "reports" && (
          <>
            <Tabs value={status} onValueChange={(v) => setStatus(v as typeof status)}>
              <TabsList>
                <TabsTrigger value="pending">Pending</TabsTrigger>
                <TabsTrigger value="reviewed">Reviewed</TabsTrigger>
                <TabsTrigger value="dismissed">Dismissed</TabsTrigger>
              </TabsList>
            </Tabs>

            {rows === null ? (
              <div className="grid place-items-center py-12 text-muted-foreground"><Loader2 className="size-5 animate-spin" /></div>
            ) : rows.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-12">No {status} reports.</p>
            ) : (
              <ul className="space-y-3">
                {rows.map((r) => (
                  <li key={r.id} className="rounded-xl border border-border bg-surface-1 p-4 space-y-3 shadow-soft">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="rounded-full bg-[#E11B22]/15 border border-[#E11B22]/40 text-[#E11B22] px-2 py-0.5 font-semibold">
                        {r.kind === "dm_message" ? "DM message" : "Forum post"}
                      </span>
                      <span className="text-muted-foreground">
                        Reported by <strong className="text-foreground">{r.reporter_name}</strong> · {formatLastSeen(r.created_at)}
                      </span>
                      {r.target_author_name && (
                        <span className="text-muted-foreground">
                          Author: <strong className="text-foreground">{r.target_author_name}</strong>
                        </span>
                      )}
                    </div>
                    <div className="rounded-lg bg-surface-2/60 border border-border/60 px-3 py-2 text-sm">
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Reported content</div>
                      {r.target_preview ? r.target_preview : <span className="text-muted-foreground italic">[content deleted or unavailable]</span>}
                    </div>
                    <div className="rounded-lg bg-surface-2/40 border border-border/60 px-3 py-2 text-sm">
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Reason</div>
                      {r.reason}
                    </div>
                    {r.status === "pending" && (
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="outline" disabled={busyId === r.id} onClick={() => void resolve(r.id, "dismissed")}>
                          <Trash2 className="size-3.5 mr-1" />Dismiss
                        </Button>
                        <Button size="sm" disabled={busyId === r.id} onClick={() => void resolve(r.id, "reviewed")} className="bg-[#E11B22] hover:bg-[#c5161c] text-white">
                          {busyId === r.id ? <Loader2 className="size-3.5 animate-spin mr-1" /> : <Check className="size-3.5 mr-1" />}
                          Mark reviewed
                        </Button>
                      </div>
                    )}
                    {r.status !== "pending" && r.reviewed_at && (
                      <div className="text-[11px] text-muted-foreground text-right">
                        {r.status} · {formatLastSeen(r.reviewed_at)}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </main>
  );
}
