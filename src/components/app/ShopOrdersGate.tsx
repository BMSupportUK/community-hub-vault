import { useState } from "react";
import { KeyRound, Loader2, Receipt } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { unlockSensitiveGate } from "@/lib/security-gates.functions";
import { useAuth } from "@/hooks/use-auth";
import { markShopOrdersUnlocked } from "@/lib/shop-orders-unlock";

export function ShopOrdersGate({ onUnlocked }: { onUnlocked: () => void }) {
  const { user } = useAuth();
  const verify = useServerFn(unlockSensitiveGate);
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);

  const unlock = async () => {
    if (!user?.email || !user.id) return;
    if (!password || !pin) return toast.error("Enter your password and PIN");
    setBusy(true);
    try {
      await verify({ data: { gate: "shop-orders", password, pin } });
      markShopOrdersUnlocked(user.id);
      toast.success("Shop orders unlocked");
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
            <Receipt className="size-5 text-primary" />
          </div>
          <div>
            <h1 className="font-display text-lg font-bold">BM Support | Shop Orders</h1>
            <p className="text-xs text-muted-foreground">
              Confirm your password and PIN to view every customer order.
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
