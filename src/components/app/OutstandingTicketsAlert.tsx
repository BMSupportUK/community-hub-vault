import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { LifeBuoy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { playSound } from "@/lib/sound";
import ticketAudio from "@/assets/ticket-notify.mp3";
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

const SESSION_KEY = "outstanding-tickets-alert-shown";

export function OutstandingTicketsAlert() {
  const { user, hasAny } = useAuth();
  const navigate = useNavigate();
  const isStaffRole = hasAny(["admin", "management", "staff"]);
  const [open, setOpen] = useState(false);
  const [counts, setCounts] = useState({ open: 0, in_progress: 0, unassigned: 0 });

  useEffect(() => {
    if (!user || !isStaffRole) return;
    let cancelled = false;
    let bootstrapped = false;

    const load = async (autoOpen: boolean) => {
      const [openRes, progRes, unassignedRes] = await Promise.all([
        supabase.from("tickets").select("id", { count: "exact", head: true }).eq("status", "open"),
        supabase.from("tickets").select("id", { count: "exact", head: true }).eq("status", "in_progress"),
        supabase.from("tickets").select("id", { count: "exact", head: true })
          .in("status", ["open", "in_progress"]).is("assigned_to", null),
      ]);
      if (cancelled) return;
      const next = {
        open: openRes.count ?? 0,
        in_progress: progRes.count ?? 0,
        unassigned: unassignedRes.count ?? 0,
      };
      setCounts(next);
      const total = next.open + next.in_progress;
      if (autoOpen && total > 0 && sessionStorage.getItem(SESSION_KEY) !== "1") {
        sessionStorage.setItem(SESSION_KEY, "1");
        setOpen(true);
      }
      bootstrapped = true;
    };

    void load(true);

    const ch = supabase
      .channel("outstanding-tickets-alert")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tickets" },
        (payload) => {
          void load(false);
          // Surface new tickets the moment they arrive — don't wait for refresh.
          if (
            bootstrapped &&
            payload.eventType === "INSERT" &&
            (payload.new as { user_id?: string } | null)?.user_id !== user.id
          ) {
            const subject =
              (payload.new as { subject?: string } | null)?.subject?.trim() ||
              "New support ticket";
            toast.info(subject, { description: "A new support ticket was just opened." });
            playSound(ticketAudio, { label: "ticket-new", gain: 2.0 });
            setOpen(true);
          }
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
  }, [user, isStaffRole]);

  if (!isStaffRole) return null;

  const total = counts.open + counts.in_progress;

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <LifeBuoy className="size-5 text-rose-500" />
            Outstanding support tickets
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm">
              <p>
                There {total === 1 ? "is" : "are"}{" "}
                <span className="font-semibold text-foreground">{total}</span>{" "}
                ticket{total === 1 ? "" : "s"} waiting for a response.
              </p>
              <ul className="list-disc pl-5 space-y-0.5 text-muted-foreground">
                <li><span className="text-foreground font-medium">{counts.open}</span> open</li>
                <li><span className="text-foreground font-medium">{counts.in_progress}</span> in progress</li>
                <li><span className="text-foreground font-medium">{counts.unassigned}</span> unassigned</li>
              </ul>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Later</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              setOpen(false);
              navigate({ to: "/tickets", search: { view: "all" } });
            }}
          >
            View tickets
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}