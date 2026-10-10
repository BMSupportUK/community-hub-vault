import { useEffect, useState } from "react";
import { Moon, Pencil, Play, Square, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { refreshDndStatus, useDndStatus } from "@/hooks/use-dnd";
import { dateInTimeZone, zonedWallTimeToUtcMs } from "@/hooks/use-timezone";
import { useUserTimezone } from "@/hooks/use-user-timezone";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AWAY_REASONS, awayWindow, isScheduledAway, type AwayReason } from "@/lib/staff-away";
import { toast } from "sonner";

function timeInZone(d: Date, timeZone: string) {
  return d.toLocaleTimeString("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hour12: false });
}

export function DndDialogButton({ className, icon = "moon" }: { className?: string; icon?: "moon" | "pencil" }) {
  const { user, isStaff } = useAuth();
  const tz = useUserTimezone();
  const info = useDndStatus(isStaff ? user?.id : null);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<AwayReason>("Toilet Break");
  const [startDay, setStartDay] = useState("");
  const [endDay, setEndDay] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!open) return;
    const current = info?.enabled && (!info.endsAt || info.endsAt.getTime() > Date.now());
    const start = current ? info?.startsAt ?? new Date() : new Date();
    const end = current ? info?.endsAt ?? new Date(Date.now() + 3600000) : new Date(Date.now() + 3600000);
    setReason(current && info?.reason ? info.reason : "Toilet Break");
    setStartDay(dateInTimeZone(start, tz));
    setEndDay(dateInTimeZone(end, tz));
    setStartTime(timeInZone(start, tz));
    setEndTime(timeInZone(end, tz));
  }, [open, tz]);

  if (!user || !isStaff) return null;
  const scheduled = isScheduledAway(reason);
  const active = !!info?.active;
  const hasWindow = !!info?.enabled && (!info.endsAt || info.endsAt.getTime() > Date.now());
  const save = async (endAway = false) => {
    if (saving) return;
    let window;
    try {
      window = endAway ? null : awayWindow(reason, zonedWallTimeToUtcMs(startDay, startTime, tz), zonedWallTimeToUtcMs(endDay, endTime, tz));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Check the dates and times");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("user_dnd_status").upsert({
      user_id: user.id,
      enabled: !endAway,
      reason,
      note: null,
      ...(window ?? { starts_at: null, ends_at: null }),
    }, { onConflict: "user_id" });
    if (!error) await refreshDndStatus(user.id);
    setSaving(false);
    if (error) { toast.error("Couldn't update Away", { description: error.message }); return; }
    toast.success(endAway ? "Away ended" : scheduled ? "Away scheduled" : "Away started");
    setOpen(false);
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={icon === "pencil" ? "Edit Away" : "Away"} title={active ? `Away — ${info?.reason ?? "on"}` : "Away"} className={cn(active && "text-primary", className)}>
          {icon === "pencil" ? <Pencil className="size-4" /> : <Moon className="size-4" />}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md max-h-[90dvh] overflow-y-auto">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Moon className="size-5 text-primary" /> Away</DialogTitle></DialogHeader>
        {active && <p className="text-sm text-primary">Away — {info?.reason}</p>}
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="away-reason" className="text-sm font-medium">Away reason</label>
            <Select value={reason} onValueChange={(value) => { const selected = AWAY_REASONS.find((item) => item === value); if (selected) setReason(selected); }}>
              <SelectTrigger id="away-reason"><SelectValue /></SelectTrigger>
              <SelectContent className="z-[120]">{AWAY_REASONS.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {scheduled && <>
            <p className="text-xs text-muted-foreground">Your Time · {tz}</p>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Starts</label>
              <div className="grid grid-cols-2 gap-3">
                <Input aria-label="Start date" type="date" value={startDay} onChange={(e) => setStartDay(e.target.value)} />
                <Input aria-label="Start time" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Finishes</label>
              <div className="grid grid-cols-2 gap-3">
                <Input aria-label="Finish date" type="date" min={startDay} value={endDay} onChange={(e) => setEndDay(e.target.value)} />
                <Input aria-label="Finish time" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
              </div>
            </div>
          </>}
        </div>
        <DialogFooter className="gap-2">
          {hasWindow && !isScheduledAway(info?.reason ?? "Outside Of Office Hours") && <Button variant="outline" disabled={saving} onClick={() => void save(true)}><Square className="size-4" /> End Away</Button>}
          <Button disabled={saving} onClick={() => void save()}>{scheduled ? <Save className="size-4" /> : <Play className="size-4" />}{saving ? "Saving…" : scheduled ? "Save schedule" : "Start Away"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
