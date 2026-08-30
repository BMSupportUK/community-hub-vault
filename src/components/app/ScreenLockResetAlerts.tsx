import { useCallback, useEffect, useState } from "react";
import { Loader2, Lock } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { approveLockReset, denyLockReset } from "@/lib/screen-lock.functions";
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

interface PendingRequest {
  id: string;
  user_id: string;
  name: string;
}

export function ScreenLockResetAlerts() {
  const { user, hasAny } = useAuth();
  const isAdmin = hasAny(["admin", "management"]);
  const [queue, setQueue] = useState<PendingRequest[]>([]);
  const [busy, setBusy] = useState(false);
  const current = queue[0] ?? null;

  const nameFor = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from("profiles")
      .select("display_name, username")
      .eq("id", userId)
      .maybeSingle();
    const p = data as { display_name?: string | null; username?: string | null } | null;
    return p?.display_name || p?.username || "A user";
  }, []);

  const push = useCallback(
    async (row: { id: string; user_id: string }) => {
      const name = await nameFor(row.user_id);
      setQueue((q) => (q.some((x) => x.id === row.id) ? q : [...q, { id: row.id, user_id: row.user_id, name }]));
    },
    [nameFor],
  );

  useEffect(() => {
    if (!user || !isAdmin) return;
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("screen_lock_reset_requests")
        .select("id, user_id")
        .eq("status", "pending")
        .order("requested_at", { ascending: true });
      if (cancelled) return;
      for (const row of data ?? []) await push(row as { id: string; user_id: string });
    })();

    const ch = supabase
      .channel("screen-lock-reset-requests")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "screen_lock_reset_requests" },
        (p) => {
          const row = p.new as { id: string; user_id: string; status: string };
          if (row.status !== "pending") return;
          void push(row);
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "screen_lock_reset_requests" },
        (p) => {
          const row = p.new as { id: string; status: string };
          if (row.status !== "pending") setQueue((q) => q.filter((x) => x.id !== row.id));
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
  }, [user?.id, isAdmin, push]);

  if (!current) return null;

  const approve = async () => {
    setBusy(true);
    try {
      await approveLockReset({ data: { requestId: current.id } });
      toast.success(`${current.name} has been emailed a temporary lock code`);
      setQueue((q) => q.slice(1));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Reset failed");
    } finally {
      setBusy(false);
    }
  };

  const deny = async () => {
    setBusy(true);
    try {
      await denyLockReset({ data: { requestId: current.id } });
      setQueue((q) => q.slice(1));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not dismiss");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AlertDialog open>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Lock className="size-4 text-amber-400" /> Screen lock reset request
          </AlertDialogTitle>
          <AlertDialogDescription>
            <strong>{current.name}</strong> has forgotten their screen lock code and is asking for a reset.
            Approving generates a temporary code and emails it to them; they must set a new code before the app
            unlocks.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy} onClick={() => void deny()}>
            Dismiss
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            onClick={(e) => {
              e.preventDefault();
              void approve();
            }}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : null} Approve reset
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
