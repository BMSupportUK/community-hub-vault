import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { MessageCircle, Send, X } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { listCheckoutChat, sendCheckoutChat } from "@/lib/checkout.functions";
import { useAuth } from "@/hooks/use-auth";
import { createPortal } from "react-dom";
import { MentionText, useMentionAutocomplete } from "@/components/app/mentions";

type Msg = { id: string; sender: string; content: string; created_at: string };

export function secureCheckoutUrl(token: string) {
  const origin = typeof window === "undefined" ? "https://bmsupport.uk" : window.location.origin;
  const base = /lovable(project)?\.(app|dev)|localhost/.test(origin) ? "https://bmsupport.uk" : origin;
  return `${base}/pay/${token}`;
}

export function Thread({ messages, mine }: { messages: Msg[]; mine: "customer" | "staff" }) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [messages.length]);
  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-2">
      {messages.length === 0 && <p className="text-xs text-center text-muted-foreground py-6">No messages for this sale yet.</p>}
      {messages.map((m) => (
        <div key={m.id} className={`flex ${m.sender === mine ? "justify-end" : "justify-start"}`}>
          <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words ${m.sender === mine ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-surface-2 text-foreground rounded-bl-sm"}`}>
            <MentionText content={m.content} />
            <div className="text-[10px] opacity-70 mt-0.5">{new Date(m.created_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</div>
          </div>
        </div>
      ))}
      <div ref={end} />
    </div>
  );
}

export function Composer({ onSend }: { onSend: (t: string) => Promise<void> }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const mention = useMentionAutocomplete({ value: text, onChange: setText, textareaRef: inputRef, canBroadcast: false });
  const submit = async () => {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    try { await onSend(t); setText(""); } finally { setBusy(false); }
  };
  return (
    <div className="relative flex gap-2 p-2 border-t border-border">
      {mention.dropdown}
      <input ref={inputRef} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (mention.onKeyDown(e)) return; if (e.key === "Enter") submit(); }} placeholder="Type a message… (@ to tag)" maxLength={2000} className="flex-1 h-10 rounded-full border border-border bg-background px-4 text-sm" />
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
  const readKey = `bm-checkout-chat-read-${token}`;

  const markStaffMessagesRead = useCallback((items: Msg[]) => {
    const latest = items.filter((m) => m.sender === "staff").at(-1);
    if (latest && typeof window !== "undefined") window.localStorage.setItem(readKey, latest.created_at);
    setUnread(0);
  }, [readKey]);

  const load = useCallback(async () => {
    const r = await list({ data: { token, password } });
    if (!r.ok) return;
    setMessages(r.messages);
    if (openRef.current) {
      markStaffMessagesRead(r.messages);
      return;
    }
    const lastRead = typeof window !== "undefined" ? window.localStorage.getItem(readKey) : null;
    const unreadStaff = r.messages.filter((m) => m.sender === "staff" && (!lastRead || m.created_at > lastRead)).length;
    setUnread(unreadStaff);
  }, [list, token, password, readKey, markStaffMessagesRead]);

  const toggleChat = () => {
    setOpen((wasOpen) => {
      const willOpen = !wasOpen;
      openRef.current = willOpen;
      if (willOpen) markStaffMessagesRead(messages);
      return willOpen;
    });
  };

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
      <SlideChat open={open} onToggle={toggleChat} onClose={() => setOpen(false)} unread={unread} title={`Order #${orderRef}`} label={unread > 0 ? `Order chat, ${unread} unread` : "Order chat"}>
        <Thread messages={messages} mine="customer" />
        <Composer onSend={async (t) => {
          const r = await send({ data: { token, password, content: t } });
          if (r.ok) { await load(); chRef.current?.send({ type: "broadcast", event: "new", payload: {} }); }
        }} />
      </SlideChat>

    </>
  );
}

/** Shared data + realtime wiring for the staff side of a sale's chat. */
function useStaffCheckoutChat(orderId: string, token: string, suffix = "") {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Msg[]>([]);
  const chRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const load = useCallback(async () => {
    const { data } = await supabase.from("checkout_chat_messages").select("id,sender,content,created_at").eq("order_id", orderId).order("created_at").limit(300);
    setMessages((data ?? []) as Msg[]);
  }, [orderId]);
  useEffect(() => {
    load();
    const db = supabase.channel(`checkout-chat-db-${orderId}${suffix}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "checkout_chat_messages", filter: `order_id=eq.${orderId}` }, () => load())
      .subscribe();
    const bc = supabase.channel(`checkout-chat-${token}${suffix}`).subscribe();
    chRef.current = bc;
    return () => { supabase.removeChannel(db); supabase.removeChannel(bc); };
  }, [load, orderId, token]);
  const send = useCallback(async (content: string) => {
    const { error } = await supabase.from("checkout_chat_messages").insert({ order_id: orderId, sender: "staff", staff_id: user?.id, content });
    if (error) throw error;
    await load();
    chRef.current?.send({ type: "broadcast", event: "new", payload: {} });
  }, [orderId, user?.id, load]);
  return { messages, send };
}

/** Admin/management side of the same chat, shown inline on the order in Admin. */
export function StaffCheckoutChat({ orderId, token }: { orderId: string; token: string }) {
  const { messages, send } = useStaffCheckoutChat(orderId, token);
  return (
    <div className="h-80 flex flex-col rounded-xl border border-border overflow-hidden">
      <Thread messages={messages} mine="staff" />
      <Composer onSend={send} />
    </div>
  );
}

/** Staff chat filling a side pane (used beside a live video call). */
export function StaffCheckoutChatPanel({ orderId, token }: { orderId: string; token: string }) {
  // Own topic names so this pane never clashes with the chat bubble's channels.
  const { messages, send } = useStaffCheckoutChat(orderId, token, "-call");
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-border px-4 py-2 text-sm font-semibold">Chat with the customer</div>
      <Thread messages={messages} mine="staff" />
      <Composer onSend={send} />
    </div>
  );
}

/** Customer chat filling a side pane (used beside a live video call). */
export function CustomerCheckoutChatPanel({ token, password }: { token: string; password: string }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const list = useServerFn(listCheckoutChat);
  const sendFn = useServerFn(sendCheckoutChat);
  const load = useCallback(async () => {
    const r = await list({ data: { token, password } });
    if (r.ok) setMessages(r.messages);
  }, [list, token, password]);
  useEffect(() => {
    load();
    // The chat bubble already owns the shared topic; this pane polls instead.
    const poll = setInterval(load, 3000);
    return () => { clearInterval(poll); };
  }, [load, token]);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-border px-4 py-2 text-sm font-semibold">Chat with BM Support</div>
      <Thread messages={messages} mine="customer" />
      <Composer onSend={async (t) => {
        const r = await sendFn({ data: { token, password, content: t } });
        if (r.ok) await load();
      }} />
    </div>
  );
}

/**
 * Staff side as a bottom-corner bubble — the same shape and behaviour the
 * customer sees on their secure page, so both sides look and act alike.
 */
export function StaffCheckoutChatBubble({ orderId, token, orderRef }: { orderId: string; token: string; orderRef?: string | null }) {
  const { messages, send } = useStaffCheckoutChat(orderId, token);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [unread, setUnread] = useState(0);
  const openRef = useRef(open);
  openRef.current = open;
  const readKey = `bm-staff-chat-read-${orderId}`;

  const markCustomerMessagesRead = useCallback((items: Msg[]) => {
    const latest = items.filter((m) => m.sender === "customer").at(-1);
    if (latest && typeof window !== "undefined") window.localStorage.setItem(readKey, latest.created_at);
    setUnread(0);
  }, [readKey]);

  // Count customer replies that landed while the panel is shut, so the badge
  // stays honest as new messages arrive.
  useEffect(() => {
    if (openRef.current) { markCustomerMessagesRead(messages); return; }
    const lastRead = typeof window !== "undefined" ? window.localStorage.getItem(readKey) : null;
    setUnread(messages.filter((m) => m.sender === "customer" && (!lastRead || m.created_at > lastRead)).length);
  }, [messages, readKey, markCustomerMessagesRead]);

  const toggleChat = () => {
    setOpen((wasOpen) => {
      const willOpen = !wasOpen;
      openRef.current = willOpen;
      if (willOpen) markCustomerMessagesRead(messages);
      return willOpen;
    });
  };

  // Portal to <body>: a blurred parent card would otherwise trap these
  // "fixed" elements inside itself.
  if (!mounted) return null;
  return createPortal(
    <>
      <SlideChat open={open} onToggle={toggleChat} onClose={() => setOpen(false)} unread={unread} title={orderRef ? `Order #${orderRef}` : "Order chat"} label={unread > 0 ? `Order chat, ${unread} unread` : "Order chat"}>
        <Thread messages={messages} mine="staff" />
        <Composer onSend={send} />
      </SlideChat>
    </>,
    document.body,
  );
}

/** Messenger-style chat: a square "Order chat" tab on the right edge that slides a panel out. */
function SlideChat({ open, onToggle, onClose, unread, title, label, children }: { open: boolean; onToggle: () => void; onClose: () => void; unread: number; title: string; label: string; children: ReactNode }) {
  return (
    <>
      <div aria-hidden={!open} className={`fixed right-0 top-1/2 z-50 -translate-y-1/2 w-[min(380px,calc(100vw-1rem))] h-[min(560px,85dvh)] flex flex-col rounded-l-2xl border border-r-0 border-border bg-card shadow-2xl overflow-hidden transition-transform duration-300 ease-out ${open ? "translate-x-0" : "translate-x-full pointer-events-none"}`}>
        <div className="flex items-center justify-between px-4 py-3 bg-primary text-primary-foreground">
          <div><div className="font-semibold text-sm">{title}</div><div className="text-[11px] opacity-80">Private chat for this sale only</div></div>
          <button type="button" onClick={onClose} aria-label="Close chat"><X className="size-5" /></button>
        </div>
        {children}
      </div>
      <button type="button" onClick={onToggle} aria-label={label} aria-expanded={open} className={`fixed top-1/2 z-50 -translate-y-1/2 flex flex-col items-center gap-1.5 rounded-l-xl bg-primary px-2.5 py-4 text-primary-foreground shadow-xl transition-[right] duration-300 ease-out ${open ? "right-[min(380px,calc(100vw-1rem))]" : "right-0"}`}>
        {open ? <X className="size-5" /> : <MessageCircle className="size-5" />}
        <span className="text-xs font-semibold [writing-mode:vertical-rl] rotate-180">Order chat</span>
        {unread > 0 && !open && <span className="absolute -top-2 -left-2 min-w-5 h-5 px-1 rounded-full bg-destructive text-destructive-foreground text-[11px] font-bold grid place-items-center animate-pulse">{unread}</span>}
      </button>
    </>
  );
}
