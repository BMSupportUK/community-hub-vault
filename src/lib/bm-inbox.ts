import { useEffect, useId } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export const INBOX_ROLES = ["admin", "management", "staff", "moderator", "subscriber", "nonsubscriber"];
export type InboxMember = { id: string; name: string; username: string | null; avatar: string | null; plate: string | null };
export type InboxMessage = { id: string; sender_id: string; body: string; created_at: string; edited_at: string | null; deleted_at: string | null };
export type InboxState = { members: InboxMember[]; threads: { id: string; other_id: string; last_body: string | null; last_at: string | null; unread: number }[]; messages: InboxMessage[]; unread: number };

export function useBmInbox(thread?: string) {
  const instanceId = useId();
  const { user, roles } = useAuth();
  const enabled = !!user && roles.some(r => INBOX_ROLES.includes(r)) && !roles.some(r => ["pending", "banned", "rejected"].includes(r));
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["bm-inbox", user?.id, thread ?? null], enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("bm_inbox_state", thread ? { _thread: thread } : {});
      if (error) throw error;
      return data as unknown as InboxState;
    }, refetchInterval: 15000,
  });
  useEffect(() => {
    if (!enabled || !user) return;
    const refresh = () => { void queryClient.invalidateQueries({ queryKey: ["bm-inbox", user.id] }); };
    const channel = supabase.channel(`bm-inbox-${user.id}-${instanceId}-${thread ?? "rail"}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "bm_inbox_messages" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "bm_inbox_threads" }, refresh).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [enabled, user?.id, thread, queryClient, instanceId]);
  return { ...query, enabled };
}

export async function inboxAction(action: "start" | "send" | "read" | "edit" | "delete" | "report", target: string, body = "") {
  const { data, error } = await supabase.rpc("bm_inbox_action", { _action: action, _target: target, _body: body });
  if (error) throw error;
  return data;
}