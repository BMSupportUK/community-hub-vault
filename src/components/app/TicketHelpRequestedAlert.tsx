import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { HelpCircle } from "lucide-react";
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

interface HelpPayload {
  id: string;
  title: string;
  body: string;
  link_path: string | null;
}

export function TicketHelpRequestedAlert() {
  const { user, hasAny } = useAuth();
  const navigate = useNavigate();
  const isAdminMgmt = hasAny(["admin", "management"]);
  const [queue, setQueue] = useState<HelpPayload[]>([]);
  const current = queue[0] ?? null;

  useEffect(() => {
    if (!user || !isAdminMgmt) return;
    const ch = supabase
      .channel(`ticket-help-${user.id}`)
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
          };
          if (n.kind !== "ticket_help_requested") return;
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
  }, [user, isAdminMgmt]);

  if (!current) return null;

  // Strip the trailing requester id marker the RPC adds for cooldown tracking.
  const cleanBody = current.body.replace(/\s*\[[0-9a-f-]{36}\]\s*$/i, "");

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
            <HelpCircle className="size-5 text-amber-500" />
            {current.title}
          </AlertDialogTitle>
          <AlertDialogDescription>{cleanBody}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => void dismiss(false)}>Later</AlertDialogCancel>
          <AlertDialogAction onClick={() => void dismiss(true)}>Open ticket</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}