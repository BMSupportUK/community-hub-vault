import { useState } from "react";
import { KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { unlockRolesGate } from "@/lib/admin-users.functions";
import { useAuth } from "@/hooks/use-auth";
import { markRolesUnlocked } from "@/lib/roles-unlock";

export function RolesGate({ onUnlocked }: { onUnlocked: () => void }) {
  const { user } = useAuth();
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const unlockFn = useServerFn(unlockRolesGate);

  const unlock = async () => {
    if (!user?.id) return;
    if (!password || !pin) return toast.error("Enter your password and PIN");
    setBusy(true);
    try {
      const res = await unlockFn({ data: { password, pin } });
      if (!res.ok) throw new Error(res.error);
      markRolesUnlocked(user.id);
      toast.success("Members & Role Management unlocked");
      onUnlocked();
    } catch (e: any) {
      toast.error(e?.message ?? "Unlock failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex-1 min-h-0 overflow-y-auto grid place-items-center p-6">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface-1 p-6">
        <div className="mb-4 flex items-center gap-3">
          <div className="size-11 rounded-2xl bg-primary/15 grid place-items-center">
            <ShieldCheck className="size-5 text-primary" />
          </div>
          <div>
            <h1 className="font-display text-lg font-bold">Members &amp; Role Management</h1>
            <p className="text-xs text-muted-foreground">
              Confirm your password and PIN to manage members and roles.
            </p>
          </div>
        </div>
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          type="password"
          autoComplete="current-password"
          placeholder="Password"
          className="w-full mb-2 px-3 py-2.5 rounded-lg bg-surface-2 border border-border text-sm"
        />
        <input
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          type="password"
          placeholder="PIN"
          className="w-full mb-4 px-3 py-2.5 rounded-lg bg-surface-2 border border-border text-sm"
          onKeyDown={(e) => e.key === "Enter" && unlock()}
        />
        <button
          onClick={unlock}
          disabled={busy}
          className="w-full inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-60"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
          Verify &amp; unlock
        </button>
      </div>
    </main>
  );
}
