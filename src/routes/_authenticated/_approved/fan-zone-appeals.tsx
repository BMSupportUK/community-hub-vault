import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, CalendarClock, Loader2, MailQuestion, RefreshCw, Send, ShieldOff, UserRound } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatLastSeen } from "@/lib/relative-time";
import { replyToFanZoneAppeal, setFanZoneAppealStatus } from "@/lib/fan-zone-appeals.functions";

export const Route = createFileRoute("/_authenticated/_approved/fan-zone-appeals")({
  component: FanZoneAppealsPage,
  head: () => ({
    meta: [
      { title: "Ban appeals · Boro Fan Zone" },
      { name: "description", content: "Read and reply to Boro Fan Zone ban appeals from members." },
      { property: "og:title", content: "Ban appeals · Boro Fan Zone" },
      { property: "og:description", content: "Read and reply to Boro Fan Zone ban appeals from members." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type Appeal = {
  id: string;
  user_id: string;
  status: "open" | "replied" | "closed";
  created_at: string;
  updated_at: string;
};

type AppealMsg = {
  id: string;
  from_staff: boolean;
  author_id: string;
  body: string;
  created_at: string;
};

type BanInfo = {
  user_id: string;
  reason: string | null;
  created_at: string;
  expires_at: string | null;
};

function isBanActive(ban: BanInfo | undefined) {
  if (!ban) return false;
  if (ban.expires_at === null) return true;
  return Date.parse(ban.expires_at) > Date.now();
}


function FanZoneAppealsPage() {
  const { hasAny } = useAuth();
  const allowed = hasAny(["admin", "management", "moderator", "boro_fan_zone_moderator"]);
  const [appeals, setAppeals] = useState<Appeal[] | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [avatars, setAvatars] = useState<Record<string, string>>({});
  const [bans, setBans] = useState<Record<string, BanInfo>>({});
  const [active, setActive] = useState<Appeal | null>(null);
  const [msgs, setMsgs] = useState<AppealMsg[] | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [replyBusy, setReplyBusy] = useState(false);
  const [liftBusy, setLiftBusy] = useState(false);
  const sendAppealReply = useServerFn(replyToFanZoneAppeal);
  const setAppealStatus = useServerFn(setFanZoneAppealStatus);

  const loadNames = useCallback(async (ids: string[]) => {
    const want = [...new Set(ids.filter(Boolean))];
    if (!want.length) return;
    const [fz, pr] = await Promise.all([
      supabase.from("fan_zone_members").select("user_id, fan_alias, fan_avatar_url").in("user_id", want),
      supabase.from("profiles").select("id, display_name, username").in("id", want),
    ]);
    const map: Record<string, string> = {};
    const avs: Record<string, string> = {};
    (pr.data ?? []).forEach((p) => {
      map[p.id as string] = (p.display_name as string) || (p.username as string) || "Member";
    });
    (fz.data ?? []).forEach((m) => {
      if (m.fan_alias) map[m.user_id as string] = m.fan_alias as string;
      if (m.fan_avatar_url) avs[m.user_id as string] = m.fan_avatar_url as string;
    });
    setNames((prev) => ({ ...prev, ...map }));
    setAvatars((prev) => ({ ...prev, ...avs }));
  }, []);

  const loadBans = useCallback(async (ids: string[]) => {
    const want = [...new Set(ids.filter(Boolean))];
    if (!want.length) return;
    const { data } = await supabase
      .from("fan_zone_bans")
      .select("user_id, reason, created_at, expires_at")
      .in("user_id", want);
    const map: Record<string, BanInfo> = {};
    ((data ?? []) as BanInfo[]).forEach((b) => {
      map[b.user_id] = b;
    });
    setBans((prev) => ({ ...prev, ...map }));
  }, []);

  const loadAppeals = useCallback(async () => {
    setAppeals(null);
    const { data, error } = await supabase
      .from("fan_zone_appeals")
      .select("id, user_id, status, created_at, updated_at")
      .order("updated_at", { ascending: false })
      .limit(200);
    if (error) {
      toast.error("Couldn't load appeals", { description: error.message });
      setAppeals([]);
      return;
    }
    const list = (data ?? []) as Appeal[];
    setAppeals(list);
    void loadNames(list.map((a) => a.user_id));
    void loadBans(list.map((a) => a.user_id));
  }, [loadNames, loadBans]);


  const openAppeal = useCallback(
    async (a: Appeal) => {
      setActive(a);
      setMsgs(null);
      setReplyBody("");
      void loadBans([a.user_id]);
      const { data, error } = await supabase
        .from("fan_zone_appeal_messages")
        .select("id, from_staff, author_id, body, created_at")
        .eq("appeal_id", a.id)
        .order("created_at", { ascending: true });
      if (error) {
        toast.error("Couldn't open the appeal", { description: error.message });
        setMsgs([]);
        return;
      }
      const list = (data ?? []) as AppealMsg[];
      setMsgs(list);
      void loadNames(list.map((m) => m.author_id));
    },
    [loadNames, loadBans],
  );

  useEffect(() => {
    if (allowed) void loadAppeals();
  }, [allowed, loadAppeals]);

  // Live: new appeals and member replies land without a refresh.
  useEffect(() => {
    if (!allowed) return;
    const ch = supabase
      .channel(`fz-appeals-page-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "fan_zone_appeals" }, () => void loadAppeals())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "fan_zone_appeal_messages" }, () => {
        void loadAppeals();
        setActive((cur) => {
          if (cur) void openAppeal(cur);
          return cur;
        });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [allowed, loadAppeals, openAppeal]);

  if (!allowed) return <Navigate to="/forum" />;

  const sendReply = async (close: boolean) => {
    if (!active) return;
    const text = replyBody.trim();
    if (text.length < 2) return toast.error("Write a reply first");
    setReplyBusy(true);
    try {
      await sendAppealReply({ data: { appealId: active.id, body: text, close } });
      setReplyBody("");
      toast.success(close ? "Reply sent and appeal closed" : "Reply sent and emailed");
      await openAppeal(active);
      await loadAppeals();
    } catch (err) {
      toast.error("Couldn't send the reply", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setReplyBusy(false);
    }
  };

  const liftBan = async () => {
    if (!active) return;
    setLiftBusy(true);
    const { error } = await supabase.rpc("fan_zone_unban", { _user_id: active.user_id });
    setLiftBusy(false);
    if (error) return toast.error("Couldn't remove the ban", { description: error.message });
    toast.success("Ban removed — they can use the Fan Zone again.");
    await loadBans([active.user_id]);
  };

  const reopenAppeal = async () => {
    if (!active) return;
    try {
      await setAppealStatus({ data: { appealId: active.id, status: "open" } });
      toast.success("Appeal reopened");
      await loadAppeals();
      setActive({ ...active, status: "open" });
    } catch (err) {
      toast.error("Couldn't reopen", { description: err instanceof Error ? err.message : undefined });
    }
  };

  const statusPill = (status: Appeal["status"]) => (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider border ${
        status === "open"
          ? "bg-[#E11B22]/15 border-[#E11B22]/50 text-[#ff6b70]"
          : status === "replied"
            ? "bg-amber-500/15 border-amber-400/50 text-amber-300"
            : "bg-emerald-500/15 border-emerald-400/50 text-emerald-300"
      }`}
    >
      <span
        className={`size-1.5 rounded-full ${
          status === "open" ? "bg-[#E11B22]" : status === "replied" ? "bg-amber-400" : "bg-emerald-400"
        }`}
      />
      {status === "open" ? "Needs a reply" : status === "replied" ? "Replied" : "Closed"}
    </span>
  );

  const list = () => {
    if (appeals === null)
      return (
        <div className="grid place-items-center py-12 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
        </div>
      );
    if (!appeals.length)
      return (
        <div className="rounded-2xl border border-dashed border-border bg-surface-1/60 py-14 text-center">
          <MailQuestion className="mx-auto mb-2 size-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No appeals yet.</p>
        </div>
      );
    return (
      <ul className="grid gap-4 sm:grid-cols-2">
        {appeals.map((a) => {
          const ban = bans[a.user_id];
          const name = names[a.user_id] ?? "Fan Zone member";
          const avatar = avatars[a.user_id];
          return (
            <li
              key={a.id}
              className="group relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-surface-1 to-surface-2 p-4 shadow-soft transition-all hover:border-[#E11B22]/60 hover:shadow-lg"
            >
              <span
                className={`absolute inset-y-0 left-0 w-1 ${
                  a.status === "open"
                    ? "bg-[#E11B22]"
                    : a.status === "replied"
                      ? "bg-amber-400"
                      : "bg-emerald-400"
                }`}
              />
              <div className="pl-2 space-y-3">
                <div className="flex items-start gap-3">
                  {avatar ? (
                    <img
                      src={avatar}
                      alt={`${name} avatar`}
                      loading="lazy"
                      className="size-12 shrink-0 rounded-full border border-[#E11B22]/40 object-cover"
                    />
                  ) : (
                    <span className="grid size-12 shrink-0 place-items-center rounded-full border border-[#E11B22]/40 bg-[#E11B22]/15 text-[#ff8a8e]">
                      <UserRound className="size-6" />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="font-display font-bold text-sm truncate">{name}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      Last activity {formatLastSeen(a.updated_at)}
                    </div>
                  </div>
                  {statusPill(a.status)}
                </div>

                <div className="rounded-xl border border-border/70 bg-surface-2/70 p-3 space-y-1.5">
                  <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#ff8a8e]">
                    <ShieldOff className="size-3.5" />
                    Ban details
                  </div>
                  <p className="text-sm leading-relaxed">
                    {ban?.reason?.trim() ? ban.reason : "No reason recorded."}
                  </p>
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <CalendarClock className="size-3.5" />
                    {ban
                      ? `Banned ${new Date(ban.created_at).toLocaleString("en-GB", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}${
                          ban.expires_at
                            ? ` · ends ${new Date(ban.expires_at).toLocaleDateString("en-GB", {
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                              })}`
                            : " · permanent"
                        }`
                      : "No active ban on record."}
                  </div>
                </div>

                <Button
                  size="sm"
                  onClick={() => void openAppeal(a)}
                  className="w-full bg-[#E11B22] text-white hover:bg-[#c2151b]"
                >
                  <MailQuestion className="size-4 mr-1.5" />
                  Open appeal
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    );
  };


  return (
    <main className="flex-1 w-full min-w-0 min-h-full self-stretch overflow-y-auto">
      <div className="w-full px-4 sm:px-6 py-6 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <Button asChild variant="ghost" size="sm" className="-ml-2">
            <Link to="/forum">
              <ArrowLeft className="size-4 mr-1" />
              Boro Fan Zone
            </Link>
          </Button>
          <Button variant="outline" size="sm" onClick={() => void loadAppeals()}>
            <RefreshCw className="size-4 mr-1" />
            Refresh
          </Button>
        </div>

        <header className="relative overflow-hidden rounded-2xl border border-[#E11B22]/40 bg-gradient-to-r from-[#E11B22]/25 via-surface-2 to-surface-1 p-5 shadow-soft">
          <div className="absolute -right-10 -top-12 size-40 rounded-full bg-[#E11B22]/20 blur-3xl" />
          <div className="relative flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-xl border border-[#E11B22]/50 bg-[#E11B22]/20 text-[#ff6b70]">
              <MailQuestion className="size-5" />
            </span>
            <div>
              <h1 className="font-display font-bold text-2xl tracking-tight">Ban appeals</h1>
              <p className="text-xs text-muted-foreground">
                Boro Fan Zone · review and reply to members appealing a ban
              </p>
            </div>
          </div>
        </header>

        {active ? (
          <div className="space-y-4">
            <Button variant="ghost" size="sm" className="-ml-2" onClick={() => setActive(null)}>
              <ArrowLeft className="size-4 mr-1" />
              All appeals
            </Button>

            <div className="overflow-hidden rounded-2xl border border-border bg-surface-1 shadow-soft">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-gradient-to-r from-[#E11B22]/15 to-transparent px-4 py-3">
                <div>
                  <h2 className="font-display font-bold">
                    Appeal from {names[active.user_id] ?? "a Fan Zone member"}
                  </h2>
                  <p className="text-[11px] text-muted-foreground">
                    Your reply is kept here and emailed to the member.
                  </p>
                </div>
                {statusPill(active.status)}
              </div>

              {msgs === null ? (
                <div className="grid place-items-center py-10 text-muted-foreground">
                  <Loader2 className="size-5 animate-spin" />
                </div>
              ) : (
                <ul className="space-y-3 p-4">
                  {msgs.map((m) => (
                    <li
                      key={m.id}
                      className={`flex ${m.from_staff ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[85%] rounded-2xl border px-4 py-2.5 text-sm shadow-soft ${
                          m.from_staff
                            ? "rounded-br-md border-emerald-400/45 bg-gradient-to-br from-emerald-500/20 to-emerald-500/5"
                            : "rounded-bl-md border-[#E11B22]/35 bg-gradient-to-br from-[#E11B22]/15 to-transparent"
                        }`}
                      >
                        <div
                          className={`mb-1 text-[10px] font-semibold uppercase tracking-wider ${
                            m.from_staff ? "text-emerald-300" : "text-[#ff8a8e]"
                          }`}
                        >
                          {names[m.author_id] ?? (m.from_staff ? "Moderator" : "Member")} ·{" "}
                          <span className="text-muted-foreground font-normal normal-case tracking-normal">
                            {formatLastSeen(m.created_at)}
                          </span>
                        </div>
                        <p className="whitespace-pre-wrap leading-relaxed">{m.body}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-2xl border border-border bg-surface-1 p-4 shadow-soft space-y-3">
              <Textarea
                rows={4}
                maxLength={2000}
                value={replyBody}
                onChange={(e) => setReplyBody(e.target.value)}
                placeholder="Write your reply…"
                className="resize-none border-border/70 bg-surface-2 focus-visible:ring-[#E11B22]/50"
              />
              <div className="flex flex-wrap items-center justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={liftBusy}
                onClick={() => void liftBan()}
                className="mr-auto border-emerald-400/50 text-emerald-300 hover:bg-emerald-500/10 hover:text-emerald-200"
              >
                {liftBusy ? <Loader2 className="size-3.5 animate-spin mr-1" /> : <ShieldOff className="size-3.5 mr-1" />}
                Remove ban
              </Button>
              {active.status === "closed" && (
                <Button variant="outline" size="sm" onClick={() => void reopenAppeal()}>
                  Reopen
                </Button>
              )}
              <Button variant="outline" size="sm" disabled={replyBusy} onClick={() => void sendReply(true)}>
                Reply &amp; close
              </Button>
              <Button
                size="sm"
                disabled={replyBusy}
                onClick={() => void sendReply(false)}
                className="bg-[#E11B22] text-white hover:bg-[#c2151b]"
              >
                {replyBusy ? <Loader2 className="size-3.5 animate-spin mr-1" /> : <Send className="size-3.5 mr-1" />}
                Send reply
              </Button>
              </div>
            </div>
          </div>
        ) : (
          list()
        )}
      </div>
    </main>
  );
}
