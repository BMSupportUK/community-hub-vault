import { useCallback, useEffect, useRef, useState } from "react";
import { MessageCircle, Send, X } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { listCheckoutChat, sendCheckoutChat } from "@/lib/checkout.functions";
import { useAuth } from "@/hooks/use-auth";

type Msg = { id: string; sender: string; content: string; created_at: string };

export function secureCheckoutUrl(token: string) {
  const origin = typeof window === "undefined" ? "https://bmsupport.uk" : window.location.origin;
  const base = /lovable(project)?\.(app|dev)|localhost/.test(origin) ? "https://bmsupport.uk" : origin;
  return `${base}/pay/${token}`;
}

function Thread({ messages, mine }: { messages: Msg[]; mine: "customer" | "staff" }) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [messages.length]);
  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-2">
      {messages.length === 0 && <p className="text-xs text-center text-muted-foreground py-6">No messages for this sale yet.</p>}
      {messages.map((m) => (
        <div key={m.id} className={`flex ${m.sender === mine ? "justify-end" : "justify-start"}`}>
          <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words ${m.sender === mine ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-surface-2 text-foreground rounded-bl-sm"}`}>
            {m.content}
            <div className="text-[10px] opacity-70 mt-0.5">{new Date(m.created_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</div>
          </div>
        </div>
      ))}
      <div ref={end} />
    </div>
  );
}

function Composer({ onSend }: { onSend: (t: string) => Promise<void> }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    try { await onSend(t); setText(""); } finally { setBusy(false); }
  };
  return (
    <div className="flex gap-2 p-2 border-t border-border">
      <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") submit(); }} placeholder="Type a message…" maxLength={2000} className="flex-1 h-10 rounded-full border border-border bg-background px-4 text-sm" />
      <button type="button" onClick={submit} disabled={busy || !text.trim()} aria-label="Send" className="size-10 grid place-items-center rounded-full bg-primary text-primary-foreground disabled:opacity-50"><Send className="size-4" /></button>
    </div>
  );
}

/** Customer-side floating chat bubble on the secure checkout page. */
export function CustomerCheckoutChat({ token, password, orderRef }: { token: string; password: string; orderRef: string }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [unread, setUnread] = useState(0);
  const list = useServerFn(listCheckoutChat);
  const send = useServerFn(sendCheckoutChat);
  const openRef = useRef(open);
  openRef.current = open;
  const chRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const load = useCallback(async () => {
    const r = await list({ data: { token, password } });
    if (!r.ok) return;
    setMessages((prev) => {
      const newStaff = r.messages.filter((m) => m.sender === "staff" && !prev.some((p) => p.id === m.id)).length;
      if (prev.length && newStaff && !openRef.current) setUnread((u) => u + newStaff);
      return r.messages;
    });
  }, [list, token, password]);

  useEffect(() => {
    load();
    const ch = supabase.channel(`checkout-chat-${token}`).on("broadcast", { event: "new" }, () => load()).subscribe();
    chRef.current = ch;
    const poll = setInterval(load, 15000);
    return () => { clearInterval(poll); supabase.removeChannel(ch); };
  }, [load, token]);

  // Browser-tab indicator: show unread replies in the tab title so the customer
  // notices even when the page is in a background tab.
  const baseTitle = useRef(typeof document !== "undefined" ? document.title : "");
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.title = unread > 0 ? `💬 (${unread}) New reply — BM Support` : baseTitle.current;
    return () => { document.title = baseTitle.current; };
  }, [unread]);


  return (
    <>
      {open && (
        <div className="fixed bottom-24 right-4 z-50 w-[min(360px,calc(100vw-2rem))] h-[min(480px,70vh)] flex flex-col rounded-2xl border border-border bg-card shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 bg-primary text-primary-foreground">
            <div><div className="font-semibold text-sm">Order #{orderRef}</div><div className="text-[11px] opacity-80">Private chat for this sale only</div></div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close chat"><X className="size-5" /></button>
          </div>
          <Thread messages={messages} mine="customer" />
          <Composer onSend={async (t) => {
            const r = await send({ data: { token, password, content: t } });
            if (r.ok) { await load(); chRef.current?.send({ type: "broadcast", event: "new", payload: {} }); }
          }} />
        </div>
      )}
      <button type="button" onClick={() => { setOpen((o) => !o); setUnread(0); }} aria-label="Chat with us" className={`fixed bottom-5 right-4 z-50 size-14 rounded-full bg-primary text-primary-foreground grid place-items-center shadow-xl hover:scale-105 transition-transform ${unread > 0 && !open ? "animate-bounce" : ""}`}>
        {unread > 0 && !open && <span className="absolute inset-0 rounded-full bg-primary/60 animate-ping" aria-hidden />}
        {open ? <X className="size-6" /> : <MessageCircle className="size-6" />}
        {unread > 0 && !open && <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-destructive text-destructive-foreground text-[11px] font-bold grid place-items-center z-10">{unread}</span>}
      </button>

    </>
  );
}

/** Admin/management side of the same chat, shown on the order in Admin. */
export function StaffCheckoutChat({ orderId, token }: { orderId: string; token: string }) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Msg[]>([]);
  const chRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const load = useCallback(async () => {
    const { data } = await supabase.from("checkout_chat_messages").select("id,sender,content,created_at").eq("order_id", orderId).order("created_at").limit(300);
    setMessages((data ?? []) as Msg[]);
  }, [orderId]);
  useEffect(() => {
    load();
    const db = supabase.channel(`checkout-chat-db-${orderId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "checkout_chat_messages", filter: `order_id=eq.${orderId}` }, () => load())
      .subscribe();
    const bc = supabase.channel(`checkout-chat-${token}`).subscribe();
    chRef.current = bc;
    return () => { supabase.removeChannel(db); supabase.removeChannel(bc); };
  }, [load, orderId, token]);
  return (
    <div className="h-80 flex flex-col rounded-xl border border-border overflow-hidden">
      <Thread messages={messages} mine="staff" />
      <Composer onSend={async (t) => {
        const { error } = await supabase.from("checkout_chat_messages").insert({ order_id: orderId, sender: "staff", staff_id: user?.id, content: t });
        if (error) throw error;
        await load();
        chRef.current?.send({ type: "broadcast", event: "new", payload: {} });
      }} />
    </div>
  );
}
