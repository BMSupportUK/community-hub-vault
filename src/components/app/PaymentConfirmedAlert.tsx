import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { BadgePoundSterling } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { playSound } from "@/lib/sound";
import paymentReceivedAudio from "@/assets/payment-received.mp3";
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

interface PaidPayload {
  id: string;
  title: string;
  body: string | null;
  link_path: string | null;
}

/**
 * Admin/management only: plays the spoken "payment received" chime and offers
 * a button that opens the order whose payment was just confirmed.
 */
export function PaymentConfirmedAlert() {
  const { user, hasAny } = useAuth();
  const navigate = useNavigate();
  const canSee = hasAny(["admin", "management"]);
  const [queue, setQueue] = useState<PaidPayload[]>([]);
  const current = queue[0] ?? null;

  useEffect(() => {
    if (!user || !canSee) return;
    const ch = supabase
      .channel(`order-paid-${user.id}`)
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
          if (n.kind !== "order_paid") return;
          playSound(paymentReceivedAudio, { label: "payment-received", gain: 2.0 });
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
  }, [user, canSee]);

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
      navigate({ to: path as "/shop", search: searchObj });
    }
  };

  return (
    <AlertDialog open onOpenChange={(o) => { if (!o) void dismiss(false); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <BadgePoundSterling className="size-5 text-emerald-500" />
            {current.title}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {current.body ?? "A payment has been confirmed."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => void dismiss(false)}>Later</AlertDialogCancel>
          <AlertDialogAction onClick={() => void dismiss(true)}>Go to order</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
