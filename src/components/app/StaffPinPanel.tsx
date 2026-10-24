import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Copy, Eye, KeyRound, Loader2, Lock, RefreshCw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { requestStaffPinReset, revealMyStaffPin } from "@/lib/staff-pin.functions";
import { Button } from "@/components/ui/button";

type Tab = "view" | "reset";

export function StaffPinPanel() {
  const revealFn = useServerFn(revealMyStaffPin);
  const requestFn = useServerFn(requestStaffPinReset);
  const [tab, setTab] = useState<Tab>("view");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [pin, setPin] = useState<string | null | undefined>(undefined);
  const [issuedAt, setIssuedAt] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const copyPin = async () => {
    if (!pin) return;
    try {
      await navigator.clipboard.writeText(pin);
      toast.success("Staff PIN copied");
    } catch {
      toast.error("Couldn't copy PIN — please copy it manually");
    }
  };

  const reveal = async () => {
    if (!password) return toast.error("Enter your password");
    setBusy(true);
    try {
      const res = await revealFn({ data: { password } });
      if (!res.ok) throw new Error(res.error);
      setPin(res.pin);
      setIssuedAt(res.issuedAt);
      setPassword("");
    } catch (e: any) { toast.error(e.message ?? "Couldn't unlock"); }
    finally { setBusy(false); }
  };

  const requestReset = async () => {
    setBusy(true);
    try {
      const res = await requestFn({ data: { reason: reason.trim() || undefined } });
      toast.success(res.already ? "You already have a pending request." : "Request sent — an admin will issue your new PIN.");
      setReason("");
    } catch (e: any) { toast.error(e.message ?? "Request failed"); }
    finally { setBusy(false); }
  };

  const tabs: { id: Tab; label: string; icon: typeof Eye }[] = [
    { id: "view", label: "View PIN", icon: Eye },
    { id: "reset", label: "Reset PIN", icon: RefreshCw },
  ];

  const cardClass =
    "rounded-3xl border border-white/15 bg-card/80 p-5 shadow-2xl backdrop-blur-xl sm:p-6";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 rounded-2xl border border-white/15 bg-card/70 p-1.5 shadow-xl backdrop-blur-xl">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-medium transition-all ${
              tab === id
                ? "bg-gradient-primary text-primary-foreground shadow-glow"
                : "text-muted-foreground hover:bg-surface-2 hover:text-foreground"
            }`}
          >
            <Icon className="size-4" /> {label}
          </button>
        ))}
      </div>

      {tab === "view" && (
        <div className={cardClass}>
          <div className="mb-4 flex items-center gap-3">
            <div className="grid size-11 place-items-center rounded-xl bg-primary/15 ring-1 ring-primary/30">
              {pin === undefined ? <Lock className="size-5 text-primary" /> : <KeyRound className="size-5 text-primary" />}
            </div>
            <div>
              <h3 className="font-display font-bold">Your staff PIN</h3>
              <p className="text-xs text-muted-foreground">Used with your password to unlock the admin dashboard.</p>
            </div>
          </div>
          {pin === undefined ? (
            <>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && reveal()} placeholder="Account password"
                className="mb-3 w-full rounded-lg border border-border bg-background/60 px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary/60 focus:ring-2 focus:ring-primary/30" />
              <button onClick={reveal} disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-primary py-2.5 font-medium text-primary-foreground shadow-glow transition-opacity hover:opacity-90 disabled:opacity-60">
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Eye className="size-4" />} Show my PIN
              </button>
            </>
          ) : pin ? (
            <div className="space-y-2">
              <div className="flex items-center justify-center gap-3 rounded-xl border border-primary/40 bg-primary/10 px-3 py-4 shadow-glow">
                <span className="font-mono text-3xl font-bold tracking-[0.35em] text-gradient-primary">{pin}</span>
                <Button size="icon" variant="outline" className="shrink-0" onClick={() => void copyPin()} aria-label="Copy my staff PIN" title="Copy PIN">
                  <Copy className="size-4" />
                </Button>
              </div>
              {issuedAt && <p className="text-center text-xs text-muted-foreground">Issued {new Date(issuedAt).toLocaleString("en-GB")}</p>}
              <button onClick={() => setPin(undefined)} className="w-full text-xs text-muted-foreground underline">Hide</button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">You don't have an issued staff PIN yet. Request one from the Reset PIN tab.</p>
          )}
        </div>
      )}

      {tab === "reset" && (
        <div className={cardClass}>
          <div className="mb-4 flex items-center gap-3">
            <div className="grid size-11 place-items-center rounded-xl bg-primary/15 ring-1 ring-primary/30">
              <ShieldCheck className="size-5 text-primary" />
            </div>
            <div>
              <h3 className="font-display font-bold">Reset my PIN</h3>
              <p className="text-xs text-muted-foreground">An admin will be alerted and issue you a new PIN. You'll get a mention when it's ready.</p>
            </div>
          </div>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="Reason (optional)"
            className="mb-3 w-full rounded-lg border border-border bg-background/60 px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary/60 focus:ring-2 focus:ring-primary/30" />
          <button onClick={requestReset} disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-primary py-2.5 text-sm font-medium text-primary-foreground shadow-glow transition-opacity hover:opacity-90 disabled:opacity-60">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} Request a new PIN
          </button>
        </div>
      )}
    </div>
  );
}
