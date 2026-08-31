import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Capacitor } from "@capacitor/core";
import { MessageSquareReply } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { playSound } from "@/lib/sound";
import ticketReplyAudio from "@/assets/ticket-reply-notify.mp3";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface ReplyPayload {
  id: string;
  title: string;
  body: string | null;
  link_path: string | null;
}

/**
 * Alerts the staff member assigned to a ticket when the customer replies:
 * plays the spoken "reply to support ticket" chime and offers a button that
 * opens that exact ticket.
 */
export function TicketReplyAlert() {
  const { user, hasAny } = useAuth();
  const navigate = useNavigate();
  const isStaffRole = hasAny(["admin", "management", "staff", "moderator"]);
  const [queue, setQueue] = useState<ReplyPayload[]>([]);
  const seenRef = useRef<Set<string>>(new Set());
  const current = queue[0] ?? null;

  useEffect(() => {
    if (!user || !isStaffRole) return;

    const announce = (n: ReplyPayload) => {
      if (seenRef.current.has(n.id)) return;
      seenRef.current.add(n.id);
      // The native shell handles foreground replies with a local notification
      // bound to the custom MP3 channel. Browser/PWA sessions use web audio.
      if (!Capacitor.isNativePlatform()) {
        void playSound(ticketReplyAudio, { label: "ticket-reply", gain: 2.0 });
      }
      setQueue((q) => (q.some((x) => x.id === n.id) ? q : [...q, n]));
    };

    // Realtime path.
    const ch = supabase
      .channel(`ticket-reply-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "user_notifications",
          filter: `user_id=eq.${user.id}`,
        },
        (p) => {
          const n = p.new as {
            id: string;
            kind: string;
            title: string;
            body: string | null;
            link_path: string | null;
          };
          if (n.kind !== "ticket_reply") return;
          announce({ id: n.id, title: n.title, body: n.body, link_path: n.link_path });
        },
      )
      .subscribe();

    // Polling fallback — realtime events can be dropped (sleeping tab, socket
    // reconnect, mobile app resume), which previously meant no chime at all.
    let cancelled = false;
    const poll = async () => {
      const { data } = await supabase
        .from("user_notifications")
        .select("id, title, body, link_path, created_at")
        .eq("user_id", user.id)
        .eq("kind", "ticket_reply")
        .is("read_at", null)
        .gte("created_at", new Date(Date.now() - 30 * 60 * 1000).toISOString())
        .order("created_at", { ascending: true })
        .limit(10);
      if (cancelled) return;
      for (const row of (data ?? []) as Array<{
        id: string;
        title: string;
        body: string | null;
        link_path: string | null;
      }>) {
        announce({ id: row.id, title: row.title, body: row.body, link_path: row.link_path });
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 20000);
    const onVis = () => {
      if (document.visibilityState === "visible") void poll();
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onVis);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onVis);
      supabase.removeChannel(ch);
    };
  }, [user, isStaffRole]);


  if (!current) return null;

  const dismiss = async (open = true) => {
    setQueue((q) => q.slice(1));
    await supabase
      .from("user_notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", current.id);
    if (open && current.link_path) {
      const [path, search] = current.link_path.split("?");
      const searchObj: Record<string, string> = {};
      if (search) {
        for (const part of search.split("&")) {
          const [k, v] = part.split("=");
          if (k) searchObj[k] = decodeURIComponent(v ?? "");
        }
      }
      navigate({ to: path as "/tickets", search: searchObj });
    }
  };

  return (
    <AlertDialog open onOpenChange={(o) => { if (!o) void dismiss(false); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <MessageSquareReply className="size-5 text-sky-500" />
            {current.title}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {current.body ?? "There is a new reply on a ticket assigned to you."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => void dismiss(false)}>Later</AlertDialogCancel>
          <AlertDialogAction onClick={() => void dismiss(true)}>Go to ticket</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
