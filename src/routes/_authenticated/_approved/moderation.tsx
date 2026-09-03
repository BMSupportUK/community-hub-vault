import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Shield, Check, X, Send, ChevronDown, ChevronRight, MessageSquare, FileText, CheckCheck, AlertCircle, Loader2, Ban } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { banUserFromGate } from "@/lib/blacklist.functions";
import { useAuth } from "@/hooks/use-auth";
import { ChannelColumn } from "@/components/app/ChannelColumn";
import { StaffOnDutyStrip } from "@/components/app/StaffOnDutyStrip";
import { toast } from "sonner";
import { isAdminUnlocked } from "@/lib/admin-unlock";
import { SignupInfoDialog } from "@/components/app/SignupInfoDialog";
import { MentionText, STAFF_ROLE_TAGS, useMentionAutocomplete } from "@/components/app/mentions";

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
  /** What the person chose on signup: BM Support or Boro Fan Zone. */
  accessIntent?: "bm-support" | "fan-zone" | null;
}

type MsgStatus = "sending" | "sent" | "failed";
interface ThreadMsg { id: string; sender_id: string; content: string; created_at: string; status?: MsgStatus }

function ModerationPage() {
  const { isMod, user, hasAny } = useAuth();
  const isOwnerOrManagement = hasAny(["admin", "management"]);
  const canBan = hasAny(["admin", "management"]);
  const banFromGate = useServerFn(banUserFromGate);
  if (!isAdminUnlocked(user?.id)) {
    return <Navigate to="/admin" search={{ next: "/moderation" } as never} />;
  }
  const [apps, setApps] = useState<AppRow[]>([]);
  const [filter, setFilter] = useState<"pending" | "approved" | "denied">("pending");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [thread, setThread] = useState<ThreadMsg[]>([]);
  const [reply, setReply] = useState("");
  const [senderNames, setSenderNames] = useState<Record<string, string>>({});
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [banningId, setBanningId] = useState<string | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const replyRef = useRef<HTMLTextAreaElement>(null);
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
    const { data: signups } = await supabase
      .from("signup_info")
      .select("user_id, extra")
      .in("user_id", ids);
    const intentMap = new Map<string, "bm-support" | "fan-zone" | null>();
    for (const s of signups ?? []) {
      const raw = (s.extra as Record<string, unknown> | null)?.access_intent;
      if (raw === "bm-support" || raw === "fan-zone") intentMap.set(s.user_id, raw);
    }
    setApps(
      rows.map((r) => ({
        ...r,
        profile: profMap.get(r.user_id),
        accessIntent: intentMap.get(r.user_id) ?? null,
      })),
    );
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
    const el = scrollerRef.current;
    if (!el) return;
    // Instant scroll (no smooth) prevents scroll-chaining that pushes the page away from the reply box.
    el.scrollTop = el.scrollHeight;
  }, [thread.length]);

  if (!isMod) {
    return (
      <main className="flex-1 grid place-items-center">
        <div className="text-center text-muted-foreground">Moderators only.</div>
      </main>
    );
  }

  const banApplicant = async (app: AppRow) => {
    const name = app.profile?.display_name ?? app.profile?.username ?? "this user";
    if (!window.confirm(`Ban ${name}? Their email address and known IPs will be added to the blacklist.`)) return;
    setBanningId(app.id);
    try {
      const res = await banFromGate({ data: { userId: app.user_id, applicationId: app.id } });
      const parts: string[] = [];
      if (res.email) parts.push(res.email);
      if (res.ips?.length) parts.push(`${res.ips.length} IP${res.ips.length === 1 ? "" : "s"}`);
      toast.success(`${name} banned${parts.length ? ` — blacklisted ${parts.join(" + ")}` : ""}`);
      setExpandedId(null);
      load();
    } catch (e: any) {
      toast.error(e?.message ?? "Ban failed");
    } finally {
      setBanningId(null);
    }
  };

  const decide = async (app: AppRow, decision: "approved" | "denied") => {
    setProcessingId(app.id);
    try {
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
        // Remove pending role, add rejected role so user is sent to /account-rejected
        await supabase.from("user_roles").delete().eq("user_id", app.user_id).eq("role", "pending");
        const { error: e2 } = await supabase.from("user_roles").insert({ user_id: app.user_id, role: "rejected" });
        if (e2 && !e2.message.includes("duplicate")) toast.error(e2.message);
      }
      const name = app.profile?.display_name ?? app.profile?.username ?? "Applicant";
      if (decision === "approved") {
        toast.success(`${name} approved and assigned Member role`);
      } else {
        toast.success(`Application ${decision}`);
      }
      load();
    } finally {
      setProcessingId(null);
    }
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

  const mention = useMentionAutocomplete({
    value: reply,
    onChange: setReply,
    textareaRef: replyRef,
    canBroadcast: true,
    roleMentions: [...STAFF_ROLE_TAGS],
  });

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
        <div className="flex-1 overflow-y-auto p-6 flex gap-6 items-start">
          <div className="flex-1 min-w-0 space-y-3">
            {apps.length === 0 && (
              <div className="text-center text-sm text-muted-foreground py-12">No {filter} requests.</div>
            )}
            {apps.map((a) => {
              const expanded = expandedId === a.id;
              const name = a.profile?.display_name ?? a.profile?.username ?? "User";
              const isAppeal = (a.reason ?? "").trim().toUpperCase().startsWith("[APPEAL]");
              const displayReason = isAppeal
                ? (a.reason ?? "").replace(/^\s*\[APPEAL\]\s*/i, "")
                : a.reason;
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
                      <div className="font-medium truncate flex items-center gap-2">
                        <span className="truncate">{name}</span>
                        {isAppeal && (
                          <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full font-semibold bg-fuchsia-500/15 text-fuchsia-400 shrink-0">
                            Appeal
                          </span>
                        )}
                        {a.accessIntent && (
                          <span
                            title="What they selected when signing up"
                            className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full font-semibold shrink-0 ${
                              a.accessIntent === "fan-zone"
                                ? "bg-amber-500/15 text-amber-400"
                                : "bg-sky-500/15 text-sky-400"
                            }`}
                          >
                            {a.accessIntent === "fan-zone" ? "Boro Fan Zone" : "BM Support"}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">Applied {new Date(a.created_at).toLocaleString("en-GB")}</div>
                      {displayReason && !expanded && (
                        <div className="text-xs text-muted-foreground/80 mt-1 line-clamp-1 italic">"{displayReason}"</div>
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
                      <div className="px-4 pt-3 flex justify-end">
                        <SignupInfoDialog userId={a.user_id} displayName={name} />
                        {canBan && (
                          <button
                            type="button"
                            onClick={() => banApplicant(a)}
                            disabled={banningId === a.id}
                            title="Ban user and blacklist their email + IPs"
                            aria-label="Ban user and blacklist their email and IPs"
                            className="ml-2 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-destructive/15 text-destructive hover:bg-destructive/25 text-xs font-medium disabled:opacity-50"
                          >
                            {banningId === a.id ? <Loader2 className="size-3.5 animate-spin" /> : <Ban className="size-3.5" />}
                            Ban
                          </button>
                        )}
                      </div>
                      {isAppeal && (
                        <div className="mx-4 mb-3 rounded-lg border border-fuchsia-500/30 bg-fuchsia-500/10 px-3 py-2 text-xs text-fuchsia-200">
                          This user was previously rejected and has submitted an appeal. Review their reasoning below and reply in the chat.
                        </div>
                      )}
                      {displayReason && (
                        <div className="p-4 border-b border-border">
                          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground mb-2">
                            <FileText className="size-3.5" /> {isAppeal ? "Appeal reason" : "Reason"}
                          </div>
                          <p className="text-sm whitespace-pre-wrap">{displayReason}</p>
                        </div>
                      )}
                      <div className="p-4">
                        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground mb-2">
                          <MessageSquare className="size-3.5" /> Conversation
                        </div>
                        <div ref={scrollerRef} className="max-h-72 overflow-y-auto overscroll-contain space-y-2 pr-1">
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
                                  <MentionText content={m.content} className="block" />
                                  <div className={`text-[10px] mt-0.5 flex items-center gap-1 ${mine ? "justify-end text-primary-foreground/70" : "text-muted-foreground"}`}>
                                    <span>{new Date(m.created_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</span>
                                    {mine && m.status === "sending" && <Loader2 className="size-3 animate-spin" aria-label="Sending" />}
                                    {mine && m.status === "sent" && <CheckCheck className="size-3" aria-label="Sent" />}
                                    {mine && !m.status && <Check className="size-3" aria-label="Sent" />}
                                    {mine && m.status === "failed" && <AlertCircle className="size-3 text-destructive" aria-label="Failed to send" />}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                          {peerTyping && (
                            <div className="flex justify-start">
                              <div className="px-3 py-2 rounded-2xl bg-surface-2 text-[11px] text-muted-foreground inline-flex items-center gap-1.5">
                                <span className="inline-flex gap-0.5">
                                  <span className="size-1.5 rounded-full bg-muted-foreground/70 animate-bounce" style={{ animationDelay: "0ms" }} />
                                  <span className="size-1.5 rounded-full bg-muted-foreground/70 animate-bounce" style={{ animationDelay: "150ms" }} />
                                  <span className="size-1.5 rounded-full bg-muted-foreground/70 animate-bounce" style={{ animationDelay: "300ms" }} />
                                </span>
                                Applicant is typing…
                              </div>
                            </div>
                          )}
                        </div>

                        {a.status === "pending" ? (
                          <>
                            <form onSubmit={sendReply} className="mt-3 relative flex items-center gap-2 bg-surface-2 border border-border rounded-lg px-3">
                              {mention.dropdown}
                              <textarea
                                ref={replyRef}
                                value={reply}
                                onChange={(e) => { setReply(e.target.value); if (e.target.value) notifyTyping(); }}
                                onKeyDown={(e) => {
                                  if (mention.onKeyDown(e)) return;
                                  if (e.key === "Enter" && !e.shiftKey) {
                                    e.preventDefault();
                                    sendReply(e as unknown as React.FormEvent);
                                  }
                                }}
                                rows={1}
                                placeholder="Reply to applicant… use @ to mention"
                                maxLength={1000}
                                className="flex-1 py-2.5 bg-transparent outline-none text-sm resize-none max-h-24"
                              />
                              <button type="submit" disabled={!reply.trim()} className="text-primary hover:text-primary-glow disabled:opacity-30">
                                <Send className="size-4" />
                              </button>
                            </form>
                            <div className="mt-3 flex items-center justify-end gap-2">
                              <button
                                onClick={() => decide(a, "denied")}
                                disabled={processingId === a.id}
                                className="px-4 py-2 rounded-lg bg-destructive/15 text-destructive hover:bg-destructive/25 text-sm font-medium inline-flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                <X className="size-4" /> Deny
                              </button>
                              <button
                                onClick={() => decide(a, "approved")}
                                disabled={processingId === a.id}
                                className="px-4 py-2 rounded-lg bg-gradient-to-r from-violet-600 via-fuchsia-600 to-blue-600 hover:from-violet-500 hover:via-fuchsia-500 hover:to-blue-500 text-white text-sm font-semibold inline-flex items-center gap-1.5 shadow-glow disabled:opacity-50 disabled:cursor-not-allowed"
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
          {isOwnerOrManagement && (
            <aside className="hidden xl:block w-[320px] shrink-0 sticky top-0">
              <StaffOnDutyStrip variant="sidebar" />
            </aside>
          )}
        </div>

      </main>
    </>
  );
}
