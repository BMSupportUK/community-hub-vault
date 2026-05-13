import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Send, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { ChannelColumn } from "@/components/app/ChannelColumn";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/gate")({
  component: GatePage,
});

interface Msg { id: string; sender_id: string; content: string; created_at: string; }

function GatePage() {
  const { user, refreshRoles, isPending } = useAuth();
  const [appId, setAppId] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("pending");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [senderNames, setSenderNames] = useState<Record<string, string>>({});
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("gate_applications")
        .select("id, status")
        .eq("user_id", user.id)
        .maybeSingle();
      if (data) {
        setAppId(data.id);
        setStatus(data.status);
        const { data: m } = await supabase
          .from("gate_messages")
          .select("id, sender_id, content, created_at")
          .eq("application_id", data.id)
          .order("created_at");
        setMsgs(m ?? []);
      }
    })();
  }, [user]);

  useEffect(() => {
    if (!appId) return;
    const ch = supabase
      .channel(`gate-${appId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "gate_messages", filter: `application_id=eq.${appId}` }, (p) => {
        setMsgs((m) => [...m, p.new as Msg]);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "gate_applications", filter: `id=eq.${appId}` }, async (p) => {
        const next = (p.new as { status: string }).status;
        setStatus(next);
        if (next === "approved") {
          toast.success("You're in! Welcome.");
          await refreshRoles();
        } else if (next === "denied") {
          toast.error("Your request was denied.");
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [appId, refreshRoles]);

  useEffect(() => {
    // load display names for senders
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
    scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs.length]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || !appId || !user) return;
    const content = text.trim();
    setText("");
    const { error } = await supabase.from("gate_messages").insert({
      application_id: appId, sender_id: user.id, content,
    });
    if (error) toast.error(error.message);
  };

  return (
    <>
      <ChannelColumn
        title="Security gate"
        groups={[{ label: "Access", items: [{ to: "/gate", label: "verification" }] }]}
      />
      <main className="flex-1 flex flex-col">
        <header className="h-14 border-b border-border px-5 flex items-center gap-2">
          <ShieldCheck className="size-4 text-primary" />
          <h1 className="font-display font-semibold">verification</h1>
          <StatusBadge status={status} />
        </header>

        <div ref={scrollerRef} className="flex-1 overflow-y-auto scrollbar-thin px-6 py-4 space-y-4">
          <div className="rounded-xl bg-surface border border-border p-4">
            <div className="font-display font-semibold text-sm">Welcome to the gate.</div>
            <p className="text-sm text-muted-foreground mt-1">
              A moderator will review your request shortly. Please introduce yourself, explain why you'd like to join,
              and confirm you'll respect the rules. You'll be granted access from this conversation.
            </p>
          </div>
          {msgs.map((m) => (
            <div key={m.id} className="flex gap-3">
              <div className="size-9 rounded-full bg-surface-2 grid place-items-center text-xs font-semibold shrink-0">
                {(senderNames[m.sender_id] ?? "?").slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="font-medium text-sm">{senderNames[m.sender_id] ?? "User"}</span>
                  <span className="text-[10px] text-muted-foreground">{new Date(m.created_at).toLocaleString()}</span>
                </div>
                <div className="text-sm text-foreground/90 whitespace-pre-wrap">{m.content}</div>
              </div>
            </div>
          ))}
        </div>

        {isPending && status === "pending" && (
          <form onSubmit={send} className="border-t border-border p-4">
            <div className="flex items-center gap-2 bg-input rounded-lg px-3">
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Message #verification"
                className="flex-1 h-11 bg-transparent outline-none text-sm"
              />
              <button className="text-primary hover:opacity-80 disabled:opacity-30" disabled={!text.trim()}>
                <Send className="size-4" />
              </button>
            </div>
          </form>
        )}
        {status === "approved" && (
          <div className="border-t border-border p-4 text-center text-sm text-success">You've been approved. Refreshing access…</div>
        )}
        {status === "denied" && (
          <div className="border-t border-border p-4 text-center text-sm text-destructive">Your request was denied.</div>
        )}
      </main>
    </>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: "bg-warning/15 text-warning",
    approved: "bg-success/15 text-success",
    denied: "bg-destructive/15 text-destructive",
  };
  return <span className={`ml-auto text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded ${map[status] ?? ""}`}>{status}</span>;
}
