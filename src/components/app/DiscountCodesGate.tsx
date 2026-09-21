import { useState } from "react";
import { KeyRound, Loader2, Tag } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { markDiscountUnlocked } from "@/lib/discount-unlock";

async function sha256Hex(input: string) {
  const enc = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function DiscountCodesGate({ onUnlocked }: { onUnlocked: () => void }) {
  const { user } = useAuth();
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);

  const unlock = async () => {
    if (!user?.email || !user.id) return;
    if (!password || !pin) return toast.error("Enter your admin password and PIN");
    setBusy(true);
    try {
      const { error: signErr } = await supabase.auth.signInWithPassword({
        email: user.email,
        password,
      });
      if (signErr) throw new Error("Incorrect password");
      const hash = await sha256Hex(`${user.id}:${pin}`);
      const { data: row } = await supabase
        .from("vault_pins")
        .select("pin_hash")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!row || row.pin_hash !== hash) throw new Error("Incorrect PIN");
      markDiscountUnlocked(user.id);
      toast.success("Discount codes unlocked");
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
            <Tag className="size-5 text-primary" />
          </div>
          <div>
            <h1 className="font-display text-lg font-bold">Discount Codes</h1>
            <p className="text-xs text-muted-foreground">
              Confirm your admin password and PIN to allocate discount codes.
            </p>
          </div>
        </div>
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          type="password"
          autoComplete="current-password"
          placeholder="Admin password"
          className="w-full mb-2 px-3 py-2.5 rounded-lg bg-surface-2 border border-border text-sm"
        />
        <input
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          type="password"
          placeholder="Admin PIN"
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
