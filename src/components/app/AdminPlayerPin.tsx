import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { adminPlayerPinStatus, disablePlayerTotp } from "@/lib/player-pin.functions";

/** Admin/management: shows whether the customer has BM Player 2FA on, and lets staff reset it (lost phone). */
export function AdminPlayerPin({ userId }: { userId: string }) {
  const status = useServerFn(adminPlayerPinStatus);
  const reset = useServerFn(disablePlayerTotp);
  const [isSet, setIsSet] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { status({ data: { userId } }).then((r) => setIsSet(r.set)).catch(() => setIsSet(null)); }, [status, userId]);
  if (isSet === null) return null;

  const run = async () => {
    if (!window.confirm("Reset this customer's BM Player 2FA? Their boxes will ask them to set it up again and old backup codes stop working.")) return;
    setBusy(true);
    try { await reset({ data: { userId } }); setIsSet(false); toast.success("Player 2FA reset"); }
    catch { toast.error("Couldn't reset 2FA."); }
    finally { setBusy(false); }
  };

  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
      Player 2FA: {isSet ? "on" : "not set up"}
      {isSet && <button type="button" disabled={busy} className="underline hover:text-foreground" onClick={() => void run()}>reset</button>}
    </span>
  );
}
