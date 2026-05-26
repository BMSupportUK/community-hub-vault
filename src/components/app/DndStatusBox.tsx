import { useEffect, useMemo, useState } from "react";
import { Moon, Clock, Save, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useDndStatus } from "@/hooks/use-dnd";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/sonner";

/** Format Date -> "HH:MM" in local time. */
function toHHMM(d: Date): string {
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}

/** Build a Date for today at the given HH:MM; if it's already past, roll to tomorrow. */
function timeToDate(hhmm: string, base = new Date(), allowPast = false): Date {
  const [h, m] = hhmm.split(":").map((n) => parseInt(n, 10));
  const d = new Date(base);
  d.setHours(h || 0, m || 0, 0, 0);
  if (!allowPast && d.getTime() <= Date.now()) {
    d.setDate(d.getDate() + 1);
  }
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

export function DndStatusBox() {
  const { user, hasAny } = useAuth();
  const canUse = !!user && hasAny(["admin", "management"]);
  const info = useDndStatus(canUse ? user?.id : null);

  const [startTime, setStartTime] = useState(() => toHHMM(new Date()));
  const [endTime, setEndTime] = useState(() =>
    toHHMM(new Date(Date.now() + 60 * 60 * 1000)),
  );
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // Hydrate inputs from server row (only when not actively editing — i.e. first load).
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    if (!info || hydrated) return;
    if (info.startsAt) setStartTime(toHHMM(info.startsAt));
    if (info.endsAt) setEndTime(toHHMM(info.endsAt));
    setNote(info.note ?? "");
    setHydrated(true);
  }, [info, hydrated]);

  // 1s tick for the countdown.
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
      // Turn on with current inputs.
      const start = timeToDate(startTime, new Date(), true);
      const end = timeToDate(endTime, start, false);
      if (end.getTime() <= start.getTime()) {
        end.setDate(end.getDate() + 1);
      }
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
    const start = timeToDate(startTime, new Date(), true);
    const end = timeToDate(endTime, start, false);
    if (end.getTime() <= start.getTime()) {
      end.setDate(end.getDate() + 1);
    }
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
    setStartTime(toHHMM(start));
    setEndTime(toHHMM(end));
  };

  return (
    <section className="px-2 pt-3">
      <div className="rounded-lg bg-surface-2/60 border border-border overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-gradient-to-r from-violet-600/15 via-fuchsia-600/10 to-violet-600/15">
          <div className="flex items-center gap-2">
            <Moon className="size-3.5 text-violet-300" />
            <h2 className="font-display text-[11px] font-bold tracking-wider uppercase">
              Do Not Disturb
            </h2>
          </div>
          <Switch
            checked={!!info?.enabled}
            onCheckedChange={handleToggle}
            disabled={saving}
            aria-label="Toggle Do Not Disturb"
          />
        </div>

        <div className="px-3 py-3 space-y-3 text-xs">
          {info?.active && (
            <div
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1",
                "bg-violet-500/15 text-violet-300 ring-violet-500/40",
              )}
            >
              <Clock className="size-3" /> {remainingLabel}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1">
              <span className="text-muted-foreground">Start</span>
              <Input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="h-8 text-xs"
              />
            </label>
            <label className="space-y-1">
              <span className="text-muted-foreground">End</span>
              <Input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="h-8 text-xs"
              />
            </label>
          </div>

          <div className="flex flex-wrap gap-1">
            <button
              type="button"
              onClick={() => applyPreset(30)}
              className="px-2 py-0.5 rounded border border-border hover:bg-muted text-[10px]"
            >
              30m
            </button>
            <button
              type="button"
              onClick={() => applyPreset(60)}
              className="px-2 py-0.5 rounded border border-border hover:bg-muted text-[10px]"
            >
              1h
            </button>
            <button
              type="button"
              onClick={() => applyPreset(120)}
              className="px-2 py-0.5 rounded border border-border hover:bg-muted text-[10px]"
            >
              2h
            </button>
            <button
              type="button"
              onClick={() => applyPreset("eod")}
              className="px-2 py-0.5 rounded border border-border hover:bg-muted text-[10px]"
            >
              End of day
            </button>
          </div>

          <Input
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, 140))}
            placeholder="Note (optional)"
            className="h-8 text-xs"
            maxLength={140}
          />

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving}
              className="h-7 text-xs flex-1"
            >
              <Save className="size-3 mr-1" />
              {saving ? "Saving…" : info?.enabled ? "Update" : "Set & enable"}
            </Button>
            {info?.enabled && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => upsert({ enabled: false })}
                disabled={saving}
                className="h-7 text-xs"
              >
                <X className="size-3 mr-1" />
                Off
              </Button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}