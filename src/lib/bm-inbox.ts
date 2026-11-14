import { useEffect, useId } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { visibleInboxThreads } from "./inbox-delete-result";

export const INBOX_ROLES = ["admin", "management", "staff", "moderator", "subscriber", "nonsubscriber"];
export type InboxMember = { id: string; name: string; username: string | null; avatar: string | null; plate: string | null; roles?: string[] };
export const INBOX_STAFF_ROLES = ["admin", "management", "staff", "moderator"];
export const isInboxStaff = (m: InboxMember) => (m.roles ?? []).some(r => INBOX_STAFF_ROLES.includes(r));
export type InboxMessage = { id: string; sender_id: string; body: string; image_path: string | null; created_at: string; edited_at: string | null; deleted_at: string | null };
export type InboxState = { members: InboxMember[]; threads: { id: string; other_id: string; last_body: string | null; last_at: string | null; unread: number }[]; messages: InboxMessage[]; unread: number };

export async function readInboxState(thread?: string): Promise<InboxState> {
  const { data, error } = await supabase.rpc("bm_inbox_state", thread ? { _thread: thread } : {});
  if (error) throw error;
  const state = data as unknown as InboxState;
  return { ...state, threads: visibleInboxThreads(state.threads) };
}

export function useBmInbox(thread?: string) {
  const instanceId = useId();
  const { user, roles } = useAuth();
  const enabled = !!user && roles.some(r => INBOX_ROLES.includes(r)) && !roles.some(r => ["pending", "banned", "rejected"].includes(r));
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["bm-inbox", user?.id, thread ?? null], enabled,
    queryFn: () => readInboxState(thread), refetchInterval: 15000,
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

export const INBOX_IMAGE_MAX_BYTES = 8 * 1024 * 1024;

// Photos live in the private inbox-images bucket at <thread>/<sender>/<file>;
// storage policies limit reads to the two conversation participants.
export async function uploadInboxImage(thread: string, userId: string, file: File) {
  const ext = (file.name.split(".").pop() ?? "png").toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
  const path = `${thread}/${userId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("inbox-images").upload(path, file, { contentType: file.type });
  if (error) throw error;
  return path;
}

export async function sendInboxImage(thread: string, path: string, caption = "") {
  const { data, error } = await supabase.rpc("bm_inbox_send_image", { _thread: thread, _path: path, _caption: caption });
  if (error) throw error;
  return data;
}

export async function inboxImageUrl(path: string) {
  const { data, error } = await supabase.storage.from("inbox-images").createSignedUrl(path, 3600);
  if (error) throw error;
  return data.signedUrl;
}

// Participant-checked deletion on both ends, scoped to the current conversation.
// Omit ids for the full conversation; reported evidence remains protected.
export async function inboxDeleteMany(thread: string, ids?: string[]) {
  const { data, error } = await supabase.rpc("bm_inbox_delete_messages", { _thread: thread, ...(ids ? { _ids: ids } : {}) });
  if (error) throw error;
  return data as unknown as { deleted: number; thread_removed: boolean };
}