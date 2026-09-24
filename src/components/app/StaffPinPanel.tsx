import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Eye, KeyRound, Loader2, Lock } from "lucide-react";
import { toast } from "sonner";
import { requestStaffPinReset, revealMyStaffPin } from "@/lib/staff-pin.functions";

export function StaffPinPanel() {
  const revealFn = useServerFn(revealMyStaffPin);
  const requestFn = useServerFn(requestStaffPinReset);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [pin, setPin] = useState<string | null | undefined>(undefined);
  const [issuedAt, setIssuedAt] = useState<string | null>(null);
  const [reason, setReason] = useState("");

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

  return (
    <div className="max-w-md space-y-4">
      <div className="rounded-2xl border border-border bg-surface-1 p-5">
        <div className="flex items-center gap-3 mb-3">
          <div className="size-10 rounded-xl bg-surface-2 grid place-items-center">
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
              className="w-full mb-3 px-3 py-2.5 rounded-lg bg-surface-2 border border-border text-sm" />
            <button onClick={reveal} disabled={busy} className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-60 flex items-center justify-center gap-2">
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Eye className="size-4" />} Show my PIN
            </button>
          </>
        ) : pin ? (
          <div className="space-y-2">
            <div className="text-center font-mono text-3xl tracking-[0.4em] py-3 rounded-xl bg-surface-2 border border-border">{pin}</div>
            {issuedAt && <p className="text-xs text-muted-foreground text-center">Issued {new Date(issuedAt).toLocaleString("en-GB")}</p>}
            <button onClick={() => setPin(undefined)} className="w-full text-xs text-muted-foreground underline">Hide</button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">You don't have an issued staff PIN yet. Request one below.</p>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-surface-1 p-5">
        <h3 className="font-display font-bold mb-1">Reset my PIN</h3>
        <p className="text-xs text-muted-foreground mb-3">An admin will be alerted and issue you a new PIN. You'll get a mention when it's ready.</p>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="Reason (optional)"
          className="w-full mb-3 px-3 py-2.5 rounded-lg bg-surface-2 border border-border text-sm" />
        <button onClick={requestReset} disabled={busy} className="w-full py-2.5 rounded-lg border border-border hover:bg-surface-2 text-sm font-medium disabled:opacity-60">
          Request a new PIN
        </button>
      </div>
    </div>
  );
}
