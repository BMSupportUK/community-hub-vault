import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Shield, Check, X, Send, ChevronDown, ChevronRight, MessageSquare, FileText, CheckCheck, AlertCircle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { ChannelColumn } from "@/components/app/ChannelColumn";
import { toast } from "sonner";
import { isAdminUnlocked } from "@/lib/admin-unlock";

export const Route = createFileRoute("/_authenticated/_approved/moderation")({
  component: ModerationPage,
});

interface AppRow {
  id: string;
  user_id: string;
  status: string;
  created_at: string;
  reason: string | null;
  profile?: { display_name: string | null; username: string | null };
}

type MsgStatus = "sending" | "sent" | "failed";
interface ThreadMsg { id: string; sender_id: string; content: string; created_at: string; status?: MsgStatus }

function ModerationPage() {
  const { isMod, user } = useAuth();
  if (!isAdminUnlocked(user?.id)) {
    return <Navigate to="/admin" search={{ next: "/moderation" } as never} />;
  }
  const [apps, setApps] = useState<AppRow[]>([]);
  const [filter, setFilter] = useState<"pending" | "approved" | "denied">("pending");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [thread, setThread] = useState<ThreadMsg[]>([]);
  const [reply, setReply] = useState("");
  const [senderNames, setSenderNames] = useState<Record<string, string>>({});
  const scrollerRef = useRef<HTMLDivElement>(null);
  const threadChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const [peerTyping, setPeerTyping] = useState<{ id: string } | null>(null);
  const peerTypingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSent = useRef<number>(0);

  const load = async () => {
    const { data: rows } = await supabase
      .from("gate_applications")
      .select("id, user_id, status, created_at, reason")
      .eq("status", filter)
      .order("created_at", { ascending: false });
    if (!rows) return;
    const ids = rows.map((r) => r.user_id);
    const { data: profs } = await supabase.from("profiles").select("id, display_name, username").in("id", ids);
    const profMap = new Map(profs?.map((p) => [p.id, p]) ?? []);
    setApps(rows.map((r) => ({ ...r, profile: profMap.get(r.user_id) })));
  };

  useEffect(() => {
    if (!isMod) return;
    load();
    const ch = supabase
      .channel("mod-queue")
      .on("postgres_changes", { event: "*", schema: "public", table: "gate_applications" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMod, filter]);

  // Load thread when expanding an application
  useEffect(() => {
    if (!expandedId) { setThread([]); return; }
    let active = true;
    supabase
      .from("gate_messages")
      .select("id, sender_id, content, created_at")
      .eq("application_id", expandedId)
      .order("created_at")
      .then(({ data }) => { if (active) setThread((data ?? []) as ThreadMsg[]); });
    const ch = supabase
      .channel(`gate-msgs-${expandedId}`, { config: { broadcast: { self: false } } })
      .on("broadcast", { event: "message" }, ({ payload }) => {
        const msg = payload as ThreadMsg;
        setThread((m) => (m.some((x) => x.id === msg.id) ? m : [...m, msg]));
      })
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        const p = payload as { sender_id: string };
        if (!user || p.sender_id === user.id) return;
        setPeerTyping({ id: p.sender_id });
        if (peerTypingTimer.current) clearTimeout(peerTypingTimer.current);
        peerTypingTimer.current = setTimeout(() => setPeerTyping(null), 3000);
      })
      .subscribe();
    threadChannelRef.current = ch;
    return () => {
      active = false;
      threadChannelRef.current = null;
      supabase.removeChannel(ch);
      if (peerTypingTimer.current) clearTimeout(peerTypingTimer.current);
      setPeerTyping(null);
    };
  }, [expandedId]);

  // Resolve sender display names
  useEffect(() => {
    const ids = Array.from(new Set(thread.map((m) => m.sender_id))).filter((id) => !senderNames[id]);
    if (!ids.length) return;
    supabase.from("profiles").select("id, display_name, username").in("id", ids).then(({ data }) => {
      setSenderNames((prev) => {
        const next = { ...prev };
        data?.forEach((p) => { next[p.id] = p.display_name ?? p.username ?? "User"; });
        return next;
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread]);

  useEffect(() => {
    scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight, behavior: "smooth" });
  }, [thread.length]);

  if (!isMod) {
    return (
      <main className="flex-1 grid place-items-center">
        <div className="text-center text-muted-foreground">Moderators only.</div>
      </main>
    );
  }

  const decide = async (app: AppRow, decision: "approved" | "denied") => {
    const { error: e1 } = await supabase
      .from("gate_applications")
      .update({ status: decision, reviewed_by: user!.id, reviewed_at: new Date().toISOString() })
      .eq("id", app.id);
    if (e1) return toast.error(e1.message);

    if (decision === "approved") {
      // Remove pending role, add member role
      await supabase.from("user_roles").delete().eq("user_id", app.user_id).eq("role", "pending");
      const { error: e2 } = await supabase.from("user_roles").insert({ user_id: app.user_id, role: "member" });
      if (e2 && !e2.message.includes("duplicate")) toast.error(e2.message);
      // Send automated approval message so the applicant knows to continue
      const { data: approvedMsg } = await supabase
        .from("gate_messages")
        .insert({
          application_id: app.id,
          sender_id: user!.id,
          content:
            "✅ Your access request has been approved!\n\nYou now have member access. Click 'Continue to dashboard' to enter the app.",
        } as never)
        .select("id, sender_id, content, created_at")
        .single();
      if (approvedMsg) {
        const msg = approvedMsg as ThreadMsg;
        setThread((m) => (m.some((x) => x.id === msg.id) ? m : [...m, msg]));
        const ch = supabase.channel(`gate-msgs-${app.id}`, { config: { broadcast: { self: false } } });
        await new Promise<void>((resolve) => {
          ch.subscribe((s) => { if (s === "SUBSCRIBED") resolve(); });
        });
        await ch.send({ type: "broadcast", event: "message", payload: msg });
        supabase.removeChannel(ch);
      }
    } else if (decision === "denied") {
      // Send automated rejection message + close the conversation
      const { data: deniedMsg } = await supabase.from("gate_messages").insert({
        application_id: app.id,
        sender_id: user!.id,
        content:
          "❌ Your application has been rejected.\n\nThis conversation is now closed. If you believe this is a mistake, you can submit an appeal from your rejected screen using the reference: APPEAL",
      } as never).select("id, sender_id, content, created_at").single();
      if (deniedMsg) {
        const msg = deniedMsg as ThreadMsg;
        setThread((m) => (m.some((x) => x.id === msg.id) ? m : [...m, msg]));
        const ch = supabase.channel(`gate-msgs-${app.id}`, { config: { broadcast: { self: false } } });
        await new Promise<void>((resolve) => {
          ch.subscribe((s) => { if (s === "SUBSCRIBED") resolve(); });
        });
        await ch.send({ type: "broadcast", event: "message", payload: msg });
        supabase.removeChannel(ch);
      }
      // Remove pending role, add banned role so user is sent to /rejected
      await supabase.from("user_roles").delete().eq("user_id", app.user_id).eq("role", "pending");
      const { error: e2 } = await supabase.from("user_roles").insert({ user_id: app.user_id, role: "banned" });
      if (e2 && !e2.message.includes("duplicate")) toast.error(e2.message);
    }
    toast.success(`Application ${decision}`);
    load();
  };

  const sendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reply.trim() || !expandedId || !user) return;
    const content = reply.trim();
    setReply("");
    const tempId = `temp-${crypto.randomUUID()}`;
    const optimistic: ThreadMsg = {
      id: tempId,
      sender_id: user.id,
      content,
      created_at: new Date().toISOString(),
      status: "sending",
    };
    setThread((m) => [...m, optimistic]);
    const { data: inserted, error } = await supabase
      .from("gate_messages")
      .insert({ application_id: expandedId, sender_id: user.id, content } as never)
      .select("id, sender_id, content, created_at")
      .single();
    if (error || !inserted) {
      setThread((m) => m.map((x) => (x.id === tempId ? { ...x, status: "failed" } : x)));
      toast.error(error?.message ?? "Send failed");
      return;
    }
    const msg: ThreadMsg = { ...(inserted as ThreadMsg), status: "sent" };
    setThread((m) => {
      const withoutTemp = m.filter((x) => x.id !== tempId);
      return withoutTemp.some((x) => x.id === msg.id) ? withoutTemp : [...withoutTemp, msg];
    });
    await threadChannelRef.current?.send({ type: "broadcast", event: "message", payload: msg });
  };

  const notifyTyping = () => {
    if (!user || !threadChannelRef.current) return;
    const now = Date.now();
    if (now - lastTypingSent.current < 1500) return;
    lastTypingSent.current = now;
    threadChannelRef.current.send({
      type: "broadcast",
      event: "typing",
      payload: { sender_id: user.id },
    });
  };

  return (
    <>
      <ChannelColumn
        title="Moderation"
        groups={[{
          label: "Queue",
          items: [
            { to: "/moderation", label: "applications" },
          ],
        }]}
      />
      <main className="flex-1 flex flex-col">
        <header className="h-14 border-b border-border px-5 flex items-center gap-2 bg-gradient-to-r from-primary/10 via-fuchsia-500/5 to-accent/10">
          <div className="size-7 rounded-lg bg-gradient-primary grid place-items-center shadow-glow">
            <Shield className="size-4 text-primary-foreground" />
          </div>
          <h1 className="font-display font-semibold">access requests</h1>
          <div className="ml-auto flex gap-1 bg-surface-2 p-1 rounded-lg">
            {(["pending", "approved", "denied"] as const).map((s) => (
              <button
                key={s}
                onClick={() => { setFilter(s); setExpandedId(null); }}
                className={`px-3 py-1 text-xs rounded-md capitalize ${filter === s ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >{s}</button>
            ))}
          </div>
        </header>
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-3xl mx-auto space-y-3">
            {apps.length === 0 && (
              <div className="text-center text-sm text-muted-foreground py-12">No {filter} requests.</div>
            )}
            {apps.map((a) => {
              const expanded = expandedId === a.id;
              const name = a.profile?.display_name ?? a.profile?.username ?? "User";
              return (
                <div key={a.id} className="rounded-xl bg-surface border border-border overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setExpandedId(expanded ? null : a.id)}
                    className="w-full p-4 flex items-center gap-4 text-left hover:bg-surface-2/50 transition-colors"
                  >
                    {expanded ? <ChevronDown className="size-4 text-muted-foreground shrink-0" /> : <ChevronRight className="size-4 text-muted-foreground shrink-0" />}
                    <div className="size-10 rounded-full bg-gradient-primary grid place-items-center font-semibold text-primary-foreground shrink-0">
                      {name.slice(0, 1).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{name}</div>
                      <div className="text-xs text-muted-foreground">Applied {new Date(a.created_at).toLocaleString()}</div>
                      {a.reason && !expanded && (
                        <div className="text-xs text-muted-foreground/80 mt-1 line-clamp-1 italic">"{a.reason}"</div>
                      )}
                    </div>
                    <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full font-semibold ${
                      a.status === "pending" ? "bg-amber-500/15 text-amber-500"
                      : a.status === "approved" ? "bg-emerald-500/15 text-emerald-500"
                      : "bg-destructive/15 text-destructive"
                    }`}>{a.status}</span>
                  </button>

                  {expanded && (
                    <div className="border-t border-border bg-background/50">
                      {a.reason && (
                        <div className="p-4 border-b border-border">
                          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground mb-2">
                            <FileText className="size-3.5" /> Reason
                          </div>
                          <p className="text-sm whitespace-pre-wrap">{a.reason}</p>
                        </div>
                      )}
                      <div className="p-4">
                        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground mb-2">
                          <MessageSquare className="size-3.5" /> Conversation
                        </div>
                        <div ref={scrollerRef} className="max-h-72 overflow-y-auto space-y-2 pr-1">
                          {thread.length === 0 && (
                            <div className="text-xs text-muted-foreground italic py-4 text-center">No messages yet.</div>
                          )}
                          {thread.map((m) => {
                            const mine = m.sender_id === user?.id;
                            const fromApplicant = m.sender_id === a.user_id;
                            return (
                              <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                                <div className={`max-w-[80%] px-3 py-2 rounded-2xl text-sm ${
                                  mine ? "bg-primary text-primary-foreground rounded-br-sm"
                                  : fromApplicant ? "bg-surface-2 rounded-bl-sm"
                                  : "bg-muted rounded-bl-sm"
                                }`}>
                                  {!mine && (
                                    <div className="text-[10px] font-semibold opacity-70 mb-0.5">
                                      {senderNames[m.sender_id] ?? (fromApplicant ? "Applicant" : "Staff")}
                                    </div>
                                  )}
                                  <div className="whitespace-pre-wrap">{m.content}</div>
                                  <div className={`text-[10px] mt-0.5 flex items-center gap-1 ${mine ? "justify-end text-primary-foreground/70" : "text-muted-foreground"}`}>
                                    <span>{new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                                    {mine && m.status === "sending" && <Loader2 className="size-3 animate-spin" aria-label="Sending" />}
                                    {mine && m.status === "sent" && <CheckCheck className="size-3" aria-label="Sent" />}
                                    {mine && !m.status && <Check className="size-3" aria-label="Sent" />}
                                    {mine && m.status === "failed" && <AlertCircle className="size-3 text-destructive" aria-label="Failed to send" />}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {a.status === "pending" ? (
                          <>
                            <form onSubmit={sendReply} className="mt-3 flex items-center gap-2 bg-surface-2 border border-border rounded-lg px-3">
                              <input
                                value={reply}
                                onChange={(e) => setReply(e.target.value)}
                                placeholder="Reply to applicant…"
                                maxLength={1000}
                                className="flex-1 h-10 bg-transparent outline-none text-sm"
                              />
                              <button type="submit" disabled={!reply.trim()} className="text-primary hover:text-primary-glow disabled:opacity-30">
                                <Send className="size-4" />
                              </button>
                            </form>
                            <div className="mt-3 flex items-center justify-end gap-2">
                              <button
                                onClick={() => decide(a, "denied")}
                                className="px-4 py-2 rounded-lg bg-destructive/15 text-destructive hover:bg-destructive/25 text-sm font-medium inline-flex items-center gap-1.5"
                              >
                                <X className="size-4" /> Deny
                              </button>
                              <button
                                onClick={() => decide(a, "approved")}
                                className="px-4 py-2 rounded-lg bg-gradient-to-r from-violet-600 via-fuchsia-600 to-blue-600 hover:from-violet-500 hover:via-fuchsia-500 hover:to-blue-500 text-white text-sm font-semibold inline-flex items-center gap-1.5 shadow-glow"
                              >
                                <Check className="size-4" /> Approve access
                              </button>
                            </div>
                          </>
                        ) : (
                          <div className="mt-3 text-xs text-muted-foreground text-center py-2 border-t border-border">
                            Decision: <span className="capitalize font-medium">{a.status}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </main>
    </>
  );
}
