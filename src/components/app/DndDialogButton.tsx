import { useEffect, useMemo, useState } from "react";
import { Clock, Moon, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useDndStatus } from "@/hooks/use-dnd";
import { dateInTimeZone, zonedWallTimeToUtcMs } from "@/hooks/use-timezone";
import { useUserTimezone } from "@/hooks/use-user-timezone";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

function toHHMMInTimeZone(d: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

function fmtRemaining(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

export function DndDialogButton({ className }: { className?: string }) {
  const { user, hasAny } = useAuth();
  const userTimezone = useUserTimezone();
  const canUse = !!user && hasAny(["admin", "management"]);
  const info = useDndStatus(canUse ? user?.id : null);

  const [open, setOpen] = useState(false);
  const [startDay, setStartDay] = useState(() => dateInTimeZone(new Date(), userTimezone));
  const [endDay, setEndDay] = useState(() =>
    dateInTimeZone(new Date(Date.now() + 60 * 60 * 1000), userTimezone),
  );
  const [startTime, setStartTime] = useState(() => toHHMMInTimeZone(new Date(), userTimezone));
  const [endTime, setEndTime] = useState(() =>
    toHHMMInTimeZone(new Date(Date.now() + 60 * 60 * 1000), userTimezone),
  );
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!info || (open && hydrated)) return;
    if (info.startsAt) {
      setStartDay(dateInTimeZone(info.startsAt, userTimezone));
      setStartTime(toHHMMInTimeZone(info.startsAt, userTimezone));
    }
    if (info.endsAt) {
      setEndDay(dateInTimeZone(info.endsAt, userTimezone));
      setEndTime(toHHMMInTimeZone(info.endsAt, userTimezone));
    }
    setNote(info.note ?? "");
    setHydrated(true);
  }, [info, open, hydrated, userTimezone]);

  useEffect(() => {
    if (!info?.active || !info.endsAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [info?.active, info?.endsAt]);

  const remainingLabel = useMemo(() => {
    if (!info?.active) return null;
    if (!info.endsAt) return "Until turned off";
    return `Ends in ${fmtRemaining(info.endsAt.getTime() - now)}`;
  }, [info?.active, info?.endsAt, now]);

  if (!canUse) return null;

  const handleSave = async () => {
    if (!user) return;
    const start = new Date(zonedWallTimeToUtcMs(startDay, startTime, userTimezone));
    let end = new Date(zonedWallTimeToUtcMs(endDay, endTime, userTimezone));
    if (end.getTime() <= start.getTime()) {
      end = new Date(start.getTime() + 60 * 60 * 1000);
      setEndDay(dateInTimeZone(end, userTimezone));
      setEndTime(toHHMMInTimeZone(end, userTimezone));
    }

    setSaving(true);
    const { error } = await supabase.from("user_dnd_status").upsert(
      {
        user_id: user.id,
        enabled: true,
        starts_at: start.toISOString(),
        ends_at: end.toISOString(),
        note: note.trim() ? note.trim().slice(0, 140) : null,
      },
      { onConflict: "user_id" },
    );
    setSaving(false);
    if (error) {
      toast.error("Couldn't update Do Not Disturb", { description: error.message });
      return;
    }
    toast.success("Do Not Disturb scheduled");
    setOpen(false);
  };

  const active = !!info?.active;

  const fieldClass =
    "h-11 text-sm bg-violet-950/40 border-violet-400/60 text-violet-50 font-semibold " +
    "focus-visible:ring-violet-400 [color-scheme:dark] " +
    "[&::-webkit-calendar-picker-indicator]:invert [&::-webkit-calendar-picker-indicator]:opacity-90 " +
    "[&::-webkit-calendar-picker-indicator]:cursor-pointer " +
    "[&::-webkit-calendar-picker-indicator]:hover:opacity-100";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          title={active ? `Do Not Disturb · ${remainingLabel ?? "on"}` : "Do Not Disturb"}
          className={cn(
            "relative p-2 rounded-lg hover:bg-surface-2 transition-colors",
            active ? "text-violet-300" : "hover:text-foreground",
            className,
          )}
        >
          <Moon className="size-4" />
          {active && (
            <span className="absolute top-1 right-1 size-2 rounded-full bg-violet-400 ring-2 ring-rail" />
          )}
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-md p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-3 border-b border-border bg-gradient-to-r from-violet-600/15 via-fuchsia-600/10 to-violet-600/15">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Moon className="size-5 text-violet-300" /> Do Not Disturb
          </DialogTitle>
          <DialogDescription className="text-sm">
            Choose when it starts and finishes — it turns on and off automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="p-5 space-y-4">
          {active && remainingLabel && (
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-violet-300">
              <Clock className="size-3.5" /> {remainingLabel}
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
              Starts
            </label>
            <div className="grid grid-cols-2 gap-3">
              <Input
                type="date"
                value={startDay}
                onChange={(e) => setStartDay(e.target.value)}
                className={fieldClass}
              />
              <Input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className={fieldClass}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
              Finishes
            </label>
            <div className="grid grid-cols-2 gap-3">
              <Input
                type="date"
                value={endDay}
                min={startDay}
                onChange={(e) => setEndDay(e.target.value)}
                className={fieldClass}
              />
              <Input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className={fieldClass}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
              Note (optional)
            </label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, 140))}
              placeholder="e.g. In a meeting"
              maxLength={140}
              className="h-11 text-sm"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2 px-6 py-4 border-t border-border bg-surface-2/40">
          <Button onClick={handleSave} disabled={saving}>
            <Save className="size-4 mr-1" />
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
