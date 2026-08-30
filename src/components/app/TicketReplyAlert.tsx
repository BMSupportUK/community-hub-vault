import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
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
  const current = queue[0] ?? null;

  useEffect(() => {
    if (!user || !isStaffRole) return;
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
          playSound(ticketReplyAudio, { label: "ticket-reply", gain: 2.0 });
          setQueue((q) =>
            q.some((x) => x.id === n.id)
              ? q
              : [...q, { id: n.id, title: n.title, body: n.body, link_path: n.link_path }],
          );
        },
      )
      .subscribe();
    return () => {
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
