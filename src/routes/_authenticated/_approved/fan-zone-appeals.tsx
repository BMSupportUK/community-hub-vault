import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Loader2, MailQuestion, RefreshCw, Send, ShieldOff } from "lucide-react";
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

function FanZoneAppealsPage() {
  const { hasAny } = useAuth();
  const allowed = hasAny(["admin", "management", "moderator", "boro_fan_zone_moderator"]);
  const [appeals, setAppeals] = useState<Appeal[] | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
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
      supabase.from("fan_zone_members").select("user_id, fan_alias").in("user_id", want),
      supabase.from("profiles").select("id, display_name, username").in("id", want),
    ]);
    const map: Record<string, string> = {};
    (pr.data ?? []).forEach((p) => {
      map[p.id as string] = (p.display_name as string) || (p.username as string) || "Member";
    });
    (fz.data ?? []).forEach((m) => {
      if (m.fan_alias) map[m.user_id as string] = m.fan_alias as string;
    });
    setNames((prev) => ({ ...prev, ...map }));
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
  }, [loadNames]);

  const openAppeal = useCallback(
    async (a: Appeal) => {
      setActive(a);
      setMsgs(null);
      setReplyBody("");
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
    [loadNames],
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

  const list = () => {
    if (appeals === null)
      return (
        <div className="grid place-items-center py-12 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
        </div>
      );
    if (!appeals.length)
      return <p className="text-sm text-muted-foreground text-center py-12">No appeals yet.</p>;
    return (
      <ul className="space-y-2">
        {appeals.map((a) => (
          <li key={a.id}>
            <button
              type="button"
              onClick={() => void openAppeal(a)}
              className="w-full text-left rounded-xl border border-border bg-surface-1 p-3 shadow-soft hover:border-[#E11B22]/50 transition-colors"
            >
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span
                  className={`rounded-full px-2 py-0.5 font-semibold border ${
                    a.status === "open"
                      ? "bg-[#E11B22]/15 border-[#E11B22]/40 text-[#E11B22]"
                      : a.status === "replied"
                        ? "bg-amber-500/15 border-amber-400/40 text-amber-300"
                        : "bg-emerald-500/15 border-emerald-400/40 text-emerald-300"
                  }`}
                >
                  {a.status === "open" ? "Needs a reply" : a.status === "replied" ? "Replied" : "Closed"}
                </span>
                <strong className="text-foreground text-sm">{names[a.user_id] ?? "Fan Zone member"}</strong>
                <span className="text-muted-foreground">last activity {formatLastSeen(a.updated_at)}</span>
              </div>
            </button>
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

        <header className="flex items-center gap-2">
          <MailQuestion className="size-5 text-[#E11B22]" />
          <h1 className="font-display font-bold text-xl">Ban appeals</h1>
        </header>

        {active ? (
          <div className="space-y-3">
            <Button variant="ghost" size="sm" className="-ml-2" onClick={() => setActive(null)}>
              <ArrowLeft className="size-4 mr-1" />
              All appeals
            </Button>
            <h2 className="font-semibold">
              Appeal from {names[active.user_id] ?? "a Fan Zone member"}
            </h2>
            <p className="text-xs text-muted-foreground">
              Your reply is kept here and emailed to the member.
            </p>
            {msgs === null ? (
              <div className="grid place-items-center py-10 text-muted-foreground">
                <Loader2 className="size-5 animate-spin" />
              </div>
            ) : (
              <ul className="space-y-2">
                {msgs.map((m) => (
                  <li
                    key={m.id}
                    className={`rounded-xl border p-3 text-sm ${
                      m.from_staff ? "border-emerald-400/40 bg-emerald-500/10" : "border-border bg-surface-1"
                    }`}
                  >
                    <div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                      {names[m.author_id] ?? (m.from_staff ? "Moderator" : "Member")} · {formatLastSeen(m.created_at)}
                    </div>
                    <p className="whitespace-pre-wrap">{m.body}</p>
                  </li>
                ))}
              </ul>
            )}
            <Textarea
              rows={4}
              maxLength={2000}
              value={replyBody}
              onChange={(e) => setReplyBody(e.target.value)}
              placeholder="Write your reply…"
            />
            <div className="flex flex-wrap justify-end gap-2">
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
              <Button size="sm" disabled={replyBusy} onClick={() => void sendReply(false)}>
                {replyBusy ? <Loader2 className="size-3.5 animate-spin mr-1" /> : <Send className="size-3.5 mr-1" />}
                Send reply
              </Button>
            </div>
          </div>
        ) : (
          list()
        )}
      </div>
    </main>
  );
}
