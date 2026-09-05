import { useState } from "react";
import { Loader2, VolumeX, Volume2 } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { FanZoneMute } from "@/hooks/use-fan-zone-mute";

const DURATIONS = [
  { label: "1 hour", minutes: 60 },
  { label: "6 hours", minutes: 360 },
  { label: "24 hours", minutes: 1440 },
  { label: "3 days", minutes: 4320 },
  { label: "7 days", minutes: 10080 },
  { label: "30 days", minutes: 43200 },
];

export function FanZoneMuteDialog({
  userId,
  alias,
  mute,
  onChanged,
}: {
  userId: string;
  alias: string;
  mute: FanZoneMute | null;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [minutes, setMinutes] = useState(1440);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const text = reason.trim();
    if (text.length < 3) return toast.error("Please give a reason for the mute");
    setBusy(true);
    const { error } = await supabase.rpc("fan_zone_mute", {
      _user_id: userId,
      _minutes: minutes,
      _reason: text.slice(0, 1000),
    });
    setBusy(false);
    if (error) return toast.error("Couldn't mute this member", { description: error.message });
    toast.success(`${alias} has been muted`);
    setReason("");
    setOpen(false);
    onChanged();
  };

  const unmute = async () => {
    setBusy(true);
    const { error } = await supabase.rpc("fan_zone_unmute", { _user_id: userId });
    setBusy(false);
    if (error) return toast.error("Couldn't lift the mute", { description: error.message });
    toast.success(`${alias} can post again`);
    onChanged();
  };

  if (mute) {
    return (
      <Button
        onClick={() => void unmute()}
        disabled={busy}
        variant="outline"
        className="bg-amber-500/15 border-amber-400/40 text-amber-100 hover:bg-amber-500/25 hover:text-white"
      >
        {busy ? <Loader2 className="size-4 mr-1 animate-spin" /> : <Volume2 className="size-4 mr-1" />}
        Muted until {new Date(mute.expires_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} — unmute
      </Button>
    );
  }

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        variant="outline"
        className="bg-white/10 border-white/30 text-white hover:bg-white/20 hover:text-white"
      >
        <VolumeX className="size-4 mr-1" /> Mute member
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Mute {alias}</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            They'll still be able to read the Boro Fan Zone, but can't start topics, reply or send Fan Zone messages
            until the mute ends. They'll see your reason and a countdown.
          </p>

          <div>
            <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              How long
            </div>
            <div className="flex flex-wrap gap-1.5">
              {DURATIONS.map((d) => (
                <button
                  key={d.minutes}
                  type="button"
                  onClick={() => setMinutes(d.minutes)}
                  className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                    minutes === d.minutes
                      ? "border-[#E11B22] bg-[#E11B22]/15 text-foreground font-semibold"
                      : "border-border hover:border-[#E11B22]/50"
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Reason</div>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value.slice(0, 1000))}
              placeholder="e.g. repeated personal abuse in the Match Day thread"
              rows={4}
              autoFocus
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
            <Button
              onClick={() => void submit()}
              disabled={busy || reason.trim().length < 3}
              className="bg-[#E11B22] hover:bg-[#c5161c] text-white"
            >
              {busy ? <Loader2 className="size-4 mr-1 animate-spin" /> : <VolumeX className="size-4 mr-1" />}
              Mute member
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
