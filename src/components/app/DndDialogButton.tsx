import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { CalendarIcon, Clock, Moon, Save, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useDndStatus } from "@/hooks/use-dnd";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

function toHHMM(d: Date): string {
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}

function combine(date: Date, hhmm: string): Date {
  const [h, m] = hhmm.split(":").map((n) => parseInt(n, 10));
  const d = new Date(date);
  d.setHours(h || 0, m || 0, 0, 0);
  return d;
}

function fmtRemaining(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

export function DndDialogButton() {
  const { user, hasAny } = useAuth();
  const canUse = !!user && hasAny(["admin", "management"]);
  const info = useDndStatus(canUse ? user?.id : null);

  const [open, setOpen] = useState(false);
  const [startDate, setStartDate] = useState<Date>(() => new Date());
  const [endDate, setEndDate] = useState<Date>(() => new Date(Date.now() + 60 * 60 * 1000));
  const [startTime, setStartTime] = useState(() => toHHMM(new Date()));
  const [endTime, setEndTime] = useState(() => toHHMM(new Date(Date.now() + 60 * 60 * 1000)));
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!info || hydrated) return;
    if (info.startsAt) {
      setStartDate(info.startsAt);
      setStartTime(toHHMM(info.startsAt));
    }
    if (info.endsAt) {
      setEndDate(info.endsAt);
      setEndTime(toHHMM(info.endsAt));
    }
    setNote(info.note ?? "");
    setHydrated(true);
  }, [info, hydrated]);

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

  const buildRange = () => {
    const start = combine(startDate, startTime);
    let end = combine(endDate, endTime);
    if (end.getTime() <= start.getTime()) {
      end = new Date(start.getTime() + 60 * 60 * 1000);
    }
    return { start, end };
  };

  const upsert = async (patch: {
    enabled?: boolean;
    starts_at?: string | null;
    ends_at?: string | null;
    note?: string | null;
  }) => {
    if (!user) return;
    setSaving(true);
    const payload = {
      user_id: user.id,
      enabled: patch.enabled ?? info?.enabled ?? false,
      starts_at: patch.starts_at ?? info?.startsAt?.toISOString() ?? null,
      ends_at: patch.ends_at ?? info?.endsAt?.toISOString() ?? null,
      note: patch.note ?? info?.note ?? null,
    };
    const { error } = await supabase
      .from("user_dnd_status")
      .upsert(payload, { onConflict: "user_id" });
    setSaving(false);
    if (error) {
      toast.error("Couldn't update Do Not Disturb", { description: error.message });
    }
  };

  const handleToggle = async (next: boolean) => {
    if (next) {
      const { start, end } = buildRange();
      await upsert({
        enabled: true,
        starts_at: start.toISOString(),
        ends_at: end.toISOString(),
        note: note.trim() ? note.trim().slice(0, 140) : null,
      });
    } else {
      await upsert({ enabled: false });
    }
  };

  const handleSave = async () => {
    const { start, end } = buildRange();
    await upsert({
      enabled: true,
      starts_at: start.toISOString(),
      ends_at: end.toISOString(),
      note: note.trim() ? note.trim().slice(0, 140) : null,
    });
    toast.success("Do Not Disturb updated");
  };

  const applyPreset = (minutes: number | "eod") => {
    const start = new Date();
    const end = new Date();
    if (minutes === "eod") {
      end.setHours(23, 59, 0, 0);
    } else {
      end.setTime(start.getTime() + minutes * 60 * 1000);
    }
    setStartDate(start);
    setEndDate(end);
    setStartTime(toHHMM(start));
    setEndTime(toHHMM(end));
  };

  const active = !!info?.active;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          title={active ? `Do Not Disturb · ${remainingLabel ?? "on"}` : "Do Not Disturb"}
          className={cn(
            "relative p-2 rounded-lg hover:bg-surface-2 transition-colors",
            active ? "text-violet-300" : "hover:text-foreground",
          )}
        >
          <Moon className="size-4" />
          {active && (
            <span className="absolute top-1 right-1 size-2 rounded-full bg-violet-400 ring-2 ring-rail" />
          )}
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Moon className="size-4 text-violet-300" /> Do Not Disturb
          </DialogTitle>
          <DialogDescription>
            Mute pings during a window. Pick the date and time it starts and ends.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="flex items-center justify-between rounded-md border border-border bg-surface-2/50 px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="font-medium">Enabled</span>
              {active && remainingLabel && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-500/15 text-violet-300 ring-1 ring-violet-500/40 px-2 py-0.5 text-[11px] font-semibold">
                  <Clock className="size-3" /> {remainingLabel}
                </span>
              )}
            </div>
            <Switch
              checked={!!info?.enabled}
              onCheckedChange={handleToggle}
              disabled={saving}
              aria-label="Toggle Do Not Disturb"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Start date</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn("w-full justify-start text-left font-normal h-9")}
                  >
                    <CalendarIcon className="mr-2 size-4 opacity-60" />
                    {format(startDate, "PP")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={startDate}
                    onSelect={(d) => d && setStartDate(d)}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Start time</label>
              <Input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="h-9"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">End date</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn("w-full justify-start text-left font-normal h-9")}
                  >
                    <CalendarIcon className="mr-2 size-4 opacity-60" />
                    {format(endDate, "PP")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={endDate}
                    onSelect={(d) => d && setEndDate(d)}
                    disabled={(d) => d < new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate())}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">End time</label>
              <Input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="h-9"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-1">
            {[
              { label: "30m", v: 30 as const },
              { label: "1h", v: 60 as const },
              { label: "2h", v: 120 as const },
              { label: "End of day", v: "eod" as const },
            ].map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => applyPreset(p.v)}
                className="px-2 py-1 rounded border border-border hover:bg-muted text-xs"
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Note (optional)</label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, 140))}
              placeholder="e.g. In a meeting"
              maxLength={140}
              className="h-9"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          {info?.enabled && (
            <Button
              variant="outline"
              onClick={() => upsert({ enabled: false })}
              disabled={saving}
            >
              <X className="size-4 mr-1" /> Turn off
            </Button>
          )}
          <Button onClick={handleSave} disabled={saving}>
            <Save className="size-4 mr-1" />
            {saving ? "Saving…" : info?.enabled ? "Update" : "Set & enable"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}