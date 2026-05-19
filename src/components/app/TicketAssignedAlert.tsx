import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { LifeBuoy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
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

interface AssignmentPayload {
  id: string;
  title: string;
  body: string;
  link_path: string | null;
  source_id: string | null;
}

export function TicketAssignedAlert() {
  const { user, hasAny } = useAuth();
  const navigate = useNavigate();
  const isStaffRole = hasAny(["admin", "management", "staff"]);
  const [queue, setQueue] = useState<AssignmentPayload[]>([]);
  const current = queue[0] ?? null;

  useEffect(() => {
    if (!user || !isStaffRole) return;
    const ch = supabase
      .channel(`ticket-assigned-${user.id}`)
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
            body: string;
            link_path: string | null;
            source_id: string | null;
          };
          if (n.kind !== "ticket_assigned") return;
          setQueue((q) =>
            q.some((x) => x.id === n.id)
              ? q
              : [...q, { id: n.id, title: n.title, body: n.body, link_path: n.link_path, source_id: n.source_id }],
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
    // Mark this notification read so it doesn't reappear in other surfaces.
    await supabase
      .from("user_notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", current.id);
    if (open && current.link_path) {
      // The link_path may include search params (e.g. /tickets?id=...).
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
            <LifeBuoy className="size-5 text-rose-500" />
            {current.title}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {current.body}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => void dismiss(false)}>Later</AlertDialogCancel>
          <AlertDialogAction onClick={() => void dismiss(true)}>Open ticket</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}