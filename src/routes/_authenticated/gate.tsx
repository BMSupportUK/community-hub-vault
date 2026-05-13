import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Send, Ban, X, LogOut, ShieldCheck, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import bg from "@/assets/gate-bg.jpg";

export const Route = createFileRoute("/_authenticated/gate")({
  component: GatePage,
});

interface Msg { id: string; sender_id: string; content: string; created_at: string; }

function GatePage() {
  const { user, refreshRoles, isPending, signOut } = useAuth();
  const [appId, setAppId] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("pending");
  const [reason, setReason] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [chatOpen, setChatOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [reasonDraft, setReasonDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [senderNames, setSenderNames] = useState<Record<string, string>>({});
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("gate_applications").select("id, status, reason").eq("user_id", user.id).maybeSingle();
      if (data) {
        setAppId(data.id); setStatus(data.status); setReason(data.reason);
        const { data: m } = await supabase.from("gate_messages")
          .select("id, sender_id, content, created_at").eq("application_id", data.id).order("created_at");
        setMsgs(m ?? []);
      }
    })();
  }, [user]);

  useEffect(() => {
    if (!appId) return;
    const ch = supabase.channel(`gate-${appId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "gate_messages", filter: `application_id=eq.${appId}` },
        (p) => setMsgs((m) => [...m, p.new as Msg]))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "gate_applications", filter: `id=eq.${appId}` }, async (p) => {
        const next = (p.new as { status: string }).status;
        setStatus(next);
        if (next === "approved") { toast.success("You're in! Welcome."); await refreshRoles(); }
        else if (next === "denied") toast.error("Your request was denied.");
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [appId, refreshRoles]);

  useEffect(() => {
    const ids = Array.from(new Set(msgs.map((m) => m.sender_id))).filter((id) => !senderNames[id]);
    if (ids.length === 0) return;
    supabase.from("profiles").select("id, display_name, username").in("id", ids).then(({ data }) => {
      const next: Record<string, string> = { ...senderNames };
      data?.forEach((p) => { next[p.id] = p.display_name ?? p.username ?? "User"; });
      setSenderNames(next);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [msgs]);

  useEffect(() => {
    if (chatOpen) scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs.length, chatOpen]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || !appId || !user) return;
    const content = text.trim(); setText("");
    const { error } = await supabase.from("gate_messages").insert({
      application_id: appId, sender_id: user.id, content,
    });
    if (error) toast.error(error.message);
  };

  const submitReason = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = reasonDraft.trim();
    if (trimmed.length < 10) {
      toast.error("Please provide at least 10 characters.");
      return;
    }
    if (trimmed.length > 1000) {
      toast.error("Please keep it under 1000 characters.");
      return;
    }
    if (!appId || !user) return;
    setSubmitting(true);
    const { error } = await supabase.from("gate_applications").update({ reason: trimmed }).eq("id", appId);
    if (error) {
      setSubmitting(false);
      toast.error(error.message);
      return;
    }
    await supabase.from("gate_messages").insert({
      application_id: appId,
      sender_id: user.id,
      content: `Access request reason:\n\n${trimmed}`,
    });
    setReason(trimmed);
    setFormOpen(false);
    setChatOpen(true);
    setSubmitting(false);
    toast.success("Request submitted. Chat with an admin.");
  };

  const openChatOrForm = () => {
    if (!reason && status === "pending") setFormOpen(true);
    else setChatOpen(true);
  };

  return (
    <div className="fixed inset-0 overflow-hidden bg-black">
      {/* Cinematic background */}
      <img src={bg} alt="" className="absolute inset-0 w-full h-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/70" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(220,38,38,0.25),transparent_65%)]" />

      {/* Center card */}
      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center px-6 text-center">
        <div className="size-20 rounded-full bg-gradient-to-br from-red-500 to-red-700 grid place-items-center shadow-[0_0_60px_rgba(239,68,68,0.6)] ring-2 ring-red-500/40 mb-6">
          <Ban className="size-10 text-white" strokeWidth={2.5} />
        </div>

        <h1 className="font-display text-4xl md:text-5xl font-extrabold text-white tracking-tight">
          {status === "denied" ? "Access Denied" : status === "approved" ? "Access Granted" : "Access Required"}
        </h1>
        <p className="mt-3 text-red-200/90 text-base max-w-md">
          {status === "approved"
            ? "Welcome aboard. Refreshing your access…"
            : status === "denied"
            ? "Your request was denied. Contact an administrator if you believe this is a mistake."
            : "Your account does not have access to this service yet."}
        </p>

        {status !== "approved" && (
          <div className="mt-8 w-full max-w-md rounded-xl border border-red-500/40 bg-red-950/30 backdrop-blur-sm p-5 text-left">
            <div className="text-center font-semibold text-white text-sm">What should I do?</div>
            <p className="text-center text-red-100/80 text-sm mt-2">
              You can chat with an admin to request access to the platform.
            </p>
            <p className="text-center text-red-100/80 text-sm mt-2">
              Click the button below to start a conversation with our support team.
            </p>
          </div>
        )}

        {status !== "approved" && (
          <button
            onClick={openChatOrForm}
            disabled={!isPending && status !== "denied"}
            className="mt-6 w-full max-w-md py-3 rounded-lg font-semibold text-white bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 shadow-[0_8px_30px_rgba(220,38,38,0.45)] transition-all"
          >
            {!reason && status === "pending" ? "Submit access request" : "Chat with Admin"}
          </button>
        )}

        <button
          onClick={signOut}
          className="mt-4 text-sm text-white/60 hover:text-white/90 transition-colors inline-flex items-center gap-1.5"
        >
          {status === "approved" ? <><ShieldCheck className="size-4" /> Continue</> : <><LogOut className="size-3.5" /> Sign out instead</>}
        </button>
      </div>

      {/* Reason form dialog */}
      {formOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/70 backdrop-blur-sm">
          <form
            onSubmit={submitReason}
            className="w-full max-w-lg rounded-2xl border border-red-500/30 bg-zinc-950/95 shadow-2xl overflow-hidden"
          >
            <header className="h-14 px-5 flex items-center justify-between border-b border-white/10">
              <div className="flex items-center gap-2">
                <div className="size-8 rounded-full bg-gradient-to-br from-red-500 to-red-700 grid place-items-center">
                  <FileText className="size-4 text-white" />
                </div>
                <div className="font-display font-semibold text-white text-sm">Access request</div>
              </div>
              <button type="button" onClick={() => setFormOpen(false)} className="text-white/60 hover:text-white">
                <X className="size-5" />
              </button>
            </header>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs uppercase tracking-wider text-red-300/80 mb-2">
                  Why do you need access?
                </label>
                <textarea
                  value={reasonDraft}
                  onChange={(e) => setReasonDraft(e.target.value.slice(0, 1000))}
                  rows={6}
                  required
                  minLength={10}
                  maxLength={1000}
                  placeholder="Tell us who you are, where you found us, and what you'd like to do here…"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-white/40 outline-none focus:border-red-500/50 resize-none"
                  autoFocus
                />
                <div className="flex justify-between mt-1.5 text-[11px]">
                  <span className="text-white/40">Minimum 10 characters</span>
                  <span className="text-white/40">{reasonDraft.length}/1000</span>
                </div>
              </div>
              <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-xs text-red-100/90">
                A moderator will review your request and respond in the chat.
              </div>
            </div>
            <footer className="px-5 py-3 border-t border-white/10 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="text-sm px-3 py-2 rounded-lg text-white/70 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || reasonDraft.trim().length < 10}
                className="text-sm px-4 py-2 rounded-lg font-semibold text-white bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 disabled:opacity-50 shadow-[0_4px_20px_rgba(220,38,38,0.4)]"
              >
                {submitting ? "Submitting…" : "Submit request"}
              </button>
            </footer>
          </form>
        </div>
      )}

      {/* Chat dialog */}
      {chatOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-lg h-[640px] max-h-[90vh] rounded-2xl border border-red-500/30 bg-zinc-950/95 shadow-2xl flex flex-col overflow-hidden">
            <header className="h-14 px-5 flex items-center justify-between border-b border-white/10">
              <div className="flex items-center gap-2">
                <div className="size-8 rounded-full bg-gradient-to-br from-red-500 to-red-700 grid place-items-center">
                  <Ban className="size-4 text-white" />
                </div>
                <div>
                  <div className="font-display font-semibold text-white text-sm">Support chat</div>
                  <div className="text-[10px] uppercase tracking-wider text-red-300/80">{status}</div>
                </div>
              </div>
              <button onClick={() => setChatOpen(false)} className="text-white/60 hover:text-white"><X className="size-5" /></button>
            </header>

            <div ref={scrollerRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
              <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-3 text-xs text-red-100/90">
                Introduce yourself and explain why you'd like to join. A moderator will review and grant access from this conversation.
              </div>
              {msgs.map((m) => {
                const mine = m.sender_id === user?.id;
                return (
                  <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[80%] px-3 py-2 rounded-2xl text-sm ${
                      mine ? "bg-red-600 text-white rounded-br-sm" : "bg-white/5 text-white/90 rounded-bl-sm border border-white/10"
                    }`}>
                      {!mine && <div className="text-[10px] text-red-300 font-medium mb-0.5">{senderNames[m.sender_id] ?? "Admin"}</div>}
                      <div className="whitespace-pre-wrap">{m.content}</div>
                      <div className={`text-[10px] mt-0.5 ${mine ? "text-white/60" : "text-white/40"}`}>
                        {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {status === "pending" ? (
              <form onSubmit={send} className="p-3 border-t border-white/10">
                <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-3">
                  <input
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Message support…"
                    className="flex-1 h-11 bg-transparent outline-none text-sm text-white placeholder:text-white/40"
                    autoFocus
                  />
                  <button className="text-red-400 hover:text-red-300 disabled:opacity-30" disabled={!text.trim()}>
                    <Send className="size-4" />
                  </button>
                </div>
              </form>
            ) : (
              <div className="p-4 text-center text-sm text-white/60 border-t border-white/10">
                {status === "approved" ? "Approved — refreshing access." : "This conversation is closed."}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
