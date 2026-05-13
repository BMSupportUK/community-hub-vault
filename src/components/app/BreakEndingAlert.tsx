import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Coffee, UtensilsCrossed, AlertTriangle, Clock } from "lucide-react";
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
import { toast } from "sonner";

type BreakKind = "break" | "lunch";
const BREAK_LIMITS: Record<BreakKind, number> = { break: 15 * 60, lunch: 30 * 60 };
const WARN_AT = 2 * 60; // 2 minutes remaining

interface BreakRow {
  id: string;
  shift_id: string;
  user_id: string;
  kind: BreakKind;
  started_at: string;
  ended_at: string | null;
}

type Stage = "warn" | "over" | null;

export function BreakEndingAlert() {
  const { user, isStaff } = useAuth();
  const navigate = useNavigate();
  const [active, setActive] = useState<BreakRow | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [stage, setStage] = useState<Stage>(null);
  const shownRef = useRef<Record<string, Set<Stage>>>({});

  // tick every second while a break is active
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);

  // load active break + subscribe to changes
  useEffect(() => {
    if (!user || !isStaff) return;
    const load = async () => {
      const { data } = await supabase
        .from("breaks")
        .select("*")
        .eq("user_id", user.id)
        .is("ended_at", null)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      setActive((data as BreakRow) ?? null);
    };
    load();
    const ch = supabase
      .channel(`break-alerts-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "breaks", filter: `user_id=eq.${user.id}` },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user, isStaff]);

  // evaluate stage
  useEffect(() => {
    if (!active) { setStage(null); return; }
    const elapsed = (now - new Date(active.started_at).getTime()) / 1000;
    const remaining = BREAK_LIMITS[active.kind] - elapsed;
    const seen = (shownRef.current[active.id] ??= new Set());

    if (remaining <= 0 && !seen.has("over")) {
      seen.add("over");
      setStage("over");
      try {
        new Audio("data:audio/wav;base64,UklGRkQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YSAAAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIA=").play().catch(() => {});
      } catch { /* ignore */ }
    } else if (remaining > 0 && remaining <= WARN_AT && !seen.has("warn") && !seen.has("over")) {
      seen.add("warn");
      setStage("warn");
    }
  }, [active, now]);

  if (!active || !stage) return null;
  const label = active.kind === "lunch" ? "Lunch break" : "Break";
  const Icon = active.kind === "lunch" ? UtensilsCrossed : Coffee;
  const elapsed = (now - new Date(active.started_at).getTime()) / 1000;
  const remaining = Math.max(0, Math.round(BREAK_LIMITS[active.kind] - elapsed));
  const overBy = Math.max(0, Math.round(elapsed - BREAK_LIMITS[active.kind]));
  const mm = (s: number) => `${Math.floor(s / 60)}m ${s % 60}s`;

  const endNow = async () => {
    const { error } = await supabase
      .from("breaks")
      .update({ ended_at: new Date().toISOString() })
      .eq("id", active.id);
    if (error) toast.error(error.message);
    else toast.success(`${label} ended`);
    setStage(null);
  };

  const isOver = stage === "over";

  return (
    <AlertDialog open onOpenChange={(o) => { if (!o) setStage(null); }}>
      <AlertDialogContent className={isOver ? "border-red-500/60" : "border-amber-500/60"}>
        <AlertDialogHeader>
          <div className={`mx-auto mb-2 grid place-items-center size-14 rounded-full ${isOver ? "bg-red-500/15 text-red-500 animate-pulse" : "bg-amber-500/15 text-amber-500"}`}>
            {isOver ? <AlertTriangle className="size-7" /> : <Icon className="size-7" />}
          </div>
          <AlertDialogTitle className="text-center text-xl">
            {isOver ? `${label} is over!` : `${label} ending soon`}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-center">
            {isOver ? (
              <>
                You're <span className="font-semibold text-red-500">over by {mm(overBy)}</span>. Please clock back in.
              </>
            ) : (
              <>
                Heads up — your {label.toLowerCase()} ends in{" "}
                <span className="font-semibold text-amber-500 inline-flex items-center gap-1">
                  <Clock className="size-3.5" /> {mm(remaining)}
                </span>
                .
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="sm:justify-center gap-2">
          <AlertDialogCancel>Dismiss</AlertDialogCancel>
          <AlertDialogAction onClick={() => navigate({ to: "/clock" })}>
            Open clock
          </AlertDialogAction>
          <AlertDialogAction onClick={endNow} className={isOver ? "bg-red-600 hover:bg-red-700" : ""}>
            End {label.toLowerCase()} now
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
