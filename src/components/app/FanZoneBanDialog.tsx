import { useEffect, useState } from "react";
import { Gavel, Loader2, ShieldCheck } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { FanZoneBan } from "@/hooks/use-fan-zone-ban";

const DURATIONS: Array<{ label: string; minutes: number | null }> = [
  { label: "24 hours", minutes: 1440 },
  { label: "7 days", minutes: 10080 },
  { label: "30 days", minutes: 43200 },
  { label: "90 days", minutes: 129600 },
  { label: "1 year", minutes: 525600 },
  { label: "Permanent", minutes: null },
];

/** Live "2d 4h 11m" countdown to the end of a ban, or "Permanent". */
export function BanCountdown({ expiresAt }: { expiresAt: string | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!expiresAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [expiresAt]);
  if (!expiresAt) return <span className="font-semibold">Permanent</span>;
  const total = Math.max(0, Math.floor((Date.parse(expiresAt) - now) / 1000));
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const text = d > 0 ? `${d}d ${h}h ${m}m` : h > 0 ? `${h}h ${m}m ${s}s` : `${m}m ${s}s`;
  return <span className="font-mono tabular-nums">{text}</span>;
}

export function FanZoneBanDialog({
  userId,
  alias,
  ban,
  onChanged,
  compact = false,
}: {
  userId: string;
  alias: string;
  ban: FanZoneBan | null;
  onChanged: () => void;
  /** Small icon-style trigger for table rows. */
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [minutes, setMinutes] = useState<number | null>(10080);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const text = reason.trim();
    if (text.length < 3) return toast.error("Please give a reason for the ban");
    setBusy(true);
    const { error } = await supabase.rpc("fan_zone_ban", {
      _user_id: userId,
      _minutes: minutes as unknown as number,
      _reason: text.slice(0, 1000),
    });
    setBusy(false);
    if (error) return toast.error("Couldn't ban this member", { description: error.message });
    toast.success(`${alias} has been banned from the Boro Fan Zone`);
    setReason("");
    setOpen(false);
    onChanged();
  };

  const unban = async () => {
    setBusy(true);
    const { error } = await supabase.rpc("fan_zone_unban", { _user_id: userId });
    setBusy(false);
    if (error) return toast.error("Couldn't lift the ban", { description: error.message });
    toast.success(`${alias} can enter the Boro Fan Zone again`);
    onChanged();
  };

  if (ban) {
    return (
      <Button
        onClick={() => void unban()}
        disabled={busy}
        variant="outline"
        size={compact ? "sm" : "default"}
        title={`Banned: ${ban.reason} — click to lift the ban`}
        className="bg-[#E11B22]/15 border-[#E11B22]/50 text-rose-200 hover:bg-[#E11B22]/25 hover:text-white"
      >
        {busy ? <Loader2 className="size-4 mr-1 animate-spin" /> : <ShieldCheck className="size-4 mr-1" />}
        Banned <BanCountdown expiresAt={ban.expires_at} />
      </Button>
    );
  }

  return (
    <>
      {compact ? (
        <Button
          onClick={() => setOpen(true)}
          size="icon"
          variant="ghost"
          title={`Ban ${alias} from the Boro Fan Zone`}
          aria-label={`Ban ${alias} from the Boro Fan Zone`}
          className="size-8 text-rose-400 hover:text-rose-300"
        >
          <Gavel className="size-4" />
        </Button>
      ) : (
        <Button
          onClick={() => setOpen(true)}
          variant="outline"
          className="bg-white/10 border-white/30 text-white hover:bg-white/20 hover:text-white"
        >
          <Gavel className="size-4 mr-1" /> Ban member
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Ban {alias} from the Boro Fan Zone</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            They'll be locked out of the whole Boro Fan Zone — boards, match-day threads and Fan Zone messages — and
            will see your reason with a countdown. Their BM Support account is not affected.
          </p>

          <div>
            <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">How long</div>
            <div className="flex flex-wrap gap-1.5">
              {DURATIONS.map((d) => (
                <button
                  key={d.label}
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
              placeholder="e.g. repeated abuse of other members after a warning"
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
              {busy ? <Loader2 className="size-4 mr-1 animate-spin" /> : <Gavel className="size-4 mr-1" />}
              Ban member
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
