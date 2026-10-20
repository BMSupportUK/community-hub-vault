import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Composer, Thread } from "@/components/checkout/CheckoutChat";
import { listTicketChatByToken, sendTicketChatByToken } from "@/lib/ticket-video.functions";

type Msg = { id: string; sender: string; content: string; created_at: string };
const INVITE = /\[\[video:[a-f0-9]{64}\]\]/;

/** Staff: the ticket's public chat beside the video call (internal notes never shown). */
export function StaffTicketCallChatPanel({ ticketId, ownerId }: { ticketId: string; ownerId: string }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const load = useCallback(async () => {
    const { data } = await supabase
      .from("ticket_messages")
      .select("id,sender_id,content,created_at")
      .eq("ticket_id", ticketId)
      .eq("is_internal", false)
      .order("created_at", { ascending: false })
      .limit(100);
    setMessages(((data ?? []) as { id: string; sender_id: string; content: string; created_at: string }[]).reverse().map((r) => ({
      id: r.id,
      sender: r.sender_id === ownerId ? "customer" : "staff",
      content: INVITE.test(r.content ?? "") ? "📹 Video call link sent" : r.content,
      created_at: r.created_at,
    })));
  }, [ticketId, ownerId]);
  useEffect(() => {
    void load();
    const id = window.setInterval(load, 3000);
    return () => window.clearInterval(id);
  }, [load]);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-border px-4 py-2 text-sm font-semibold">Ticket chat</div>
      <Thread messages={messages} mine="staff" />
      <Composer onSend={async (t) => {
        const { data: u } = await supabase.auth.getUser();
        if (!u.user) return;
        const { error } = await supabase.from("ticket_messages").insert({ ticket_id: ticketId, sender_id: u.user.id, content: t, is_internal: false });
        if (error) throw error;
        await load();
      }} />
    </div>
  );
}

/** Customer phone (no sign-in): the same ticket chat beside the video call. */
export function CustomerTicketCallChatPanel({ token }: { token: string }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const list = useServerFn(listTicketChatByToken);
  const sendFn = useServerFn(sendTicketChatByToken);
  const load = useCallback(async () => {
    const r = await list({ data: { token } }).catch(() => null);
    if (r?.ok) setMessages(r.messages);
  }, [list, token]);
  useEffect(() => {
    void load();
    const id = window.setInterval(load, 3000);
    return () => window.clearInterval(id);
  }, [load]);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-border px-4 py-2 text-sm font-semibold">Ticket chat with BM Support</div>
      <Thread messages={messages} mine="customer" />
      <Composer onSend={async (t) => {
        const r = await sendFn({ data: { token, content: t } });
        if (r.ok) await load();
      }} />
    </div>
  );
}
