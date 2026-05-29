import { useEffect, useMemo, useState } from "react";
import { Clock, Moon, Save, X } from "lucide-react";
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
import { Calendar } from "@/components/ui/calendar";
import { Switch } from "@/components/ui/switch";
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

function displayDate(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(date);
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
  const userTimezone = useUserTimezone();
  const canUse = !!user && hasAny(["admin", "management"]);
  const info = useDndStatus(canUse ? user?.id : null);

  const [open, setOpen] = useState(false);
  const [startDate, setStartDate] = useState<Date>(() => new Date());
  const [endDate, setEndDate] = useState<Date>(() => new Date(Date.now() + 60 * 60 * 1000));
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
      setStartDate(info.startsAt);
      setStartTime(toHHMMInTimeZone(info.startsAt, userTimezone));
    }
    if (info.endsAt) {
      setEndDate(info.endsAt);
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

  const buildRange = () => {
    const startDateStr = dateInTimeZone(startDate, userTimezone);
    const endDateStr = dateInTimeZone(endDate, userTimezone);
    const start = new Date(zonedWallTimeToUtcMs(startDateStr, startTime, userTimezone));
    let end = new Date(zonedWallTimeToUtcMs(endDateStr, endTime, userTimezone));
    if (end.getTime() <= start.getTime()) {
      end = new Date(start.getTime() + 60 * 60 * 1000);
      setEndDate(end);
      setEndTime(toHHMMInTimeZone(end, userTimezone));
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
    let end: Date;
    if (minutes === "eod") {
      end = new Date(
        zonedWallTimeToUtcMs(dateInTimeZone(start, userTimezone), "23:59", userTimezone),
      );
    } else {
      end = new Date();
      end.setTime(start.getTime() + minutes * 60 * 1000);
    }
    setStartDate(start);
    setEndDate(end);
    setStartTime(toHHMMInTimeZone(start, userTimezone));
    setEndTime(toHHMMInTimeZone(end, userTimezone));
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
      <DialogContent className="max-w-2xl sm:max-w-2xl p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-3 border-b border-border bg-gradient-to-r from-violet-600/15 via-fuchsia-600/10 to-violet-600/15">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Moon className="size-5 text-violet-300" /> Do Not Disturb
          </DialogTitle>
          <DialogDescription className="text-sm">
            Pick the date range on the calendar, then set the start and end time.
          </DialogDescription>
        </DialogHeader>

        <div className="grid sm:grid-cols-[auto,1fr] gap-0 max-h-[70vh] overflow-y-auto">
          {/* Calendar — left column on desktop, top on mobile */}
          <div className="p-3 border-b sm:border-b-0 sm:border-r border-border bg-surface-2/30 flex items-center justify-center">
            <Calendar
              mode="range"
              selected={{ from: startDate, to: endDate }}
              onSelect={(range) => {
                if (range?.from) setStartDate(range.from);
                if (range?.to) setEndDate(range.to);
                else if (range?.from) setEndDate(range.from);
              }}
              numberOfMonths={1}
              initialFocus
              className={cn("p-2 pointer-events-auto")}
            />
          </div>

          {/* Right column — controls */}
          <div className="p-5 space-y-4">
            <div className="flex items-center justify-between rounded-lg border border-border bg-surface-2/50 px-3 py-2.5">
              <div className="flex flex-col">
                <span className="text-sm font-semibold">Enabled</span>
                {active && remainingLabel ? (
                  <span className="inline-flex items-center gap-1 text-xs text-violet-300 mt-0.5">
                    <Clock className="size-3" /> {remainingLabel}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground mt-0.5">Toggle to start</span>
                )}
              </div>
              <Switch
                checked={!!info?.enabled}
                onCheckedChange={handleToggle}
                disabled={saving}
                aria-label="Toggle Do Not Disturb"
              />
            </div>

            <div className="space-y-2">
              <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                Window
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">
                    From · {displayDate(startDate, userTimezone)}
                  </label>
                  <Input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="h-10 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">
                    To · {displayDate(endDate, userTimezone)}
                  </label>
                  <Input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="h-10 text-sm"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                Quick presets
              </div>
              <div className="flex flex-wrap gap-1.5">
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
                    className="px-3 py-1.5 rounded-md border border-border hover:bg-muted text-xs font-medium"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                Note (optional)
              </label>
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, 140))}
                placeholder="e.g. In a meeting"
                maxLength={140}
                className="h-10 text-sm"
              />
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2 px-6 py-4 border-t border-border bg-surface-2/40">
          {info?.enabled && (
            <Button variant="outline" onClick={() => upsert({ enabled: false })} disabled={saving}>
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
