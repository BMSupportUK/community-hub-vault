import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { adminPlayerPinStatus, adminSetPlayerPin } from "@/lib/player-pin.functions";

/** Admin/management: shows whether the customer has a BM Player PIN, and lets staff set or clear it. */
export function AdminPlayerPin({ userId }: { userId: string }) {
  const status = useServerFn(adminPlayerPinStatus);
  const save = useServerFn(adminSetPlayerPin);
  const [isSet, setIsSet] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { status({ data: { userId } }).then((r) => setIsSet(r.set)).catch(() => setIsSet(null)); }, [status, userId]);
  if (isSet === null) return null;

  const run = async (pin: string | null) => {
    setBusy(true);
    try {
      const r = await save({ data: { userId, pin } });
      if (!r.ok) { toast.error(r.error); return; }
      setIsSet(pin !== null);
      toast.success(pin === null ? "Player PIN cleared" : "Player PIN set");
    } catch { toast.error("Couldn't change the PIN."); }
    finally { setBusy(false); }
  };

  const setNew = () => {
    const pin = window.prompt("New 4-digit BM Player PIN for this customer")?.trim() ?? "";
    if (!pin) return;
    if (!/^\d{4}$/.test(pin)) { toast.error("Enter exactly 4 digits."); return; }
    void run(pin);
  };

  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
      PIN: {isSet ? "set" : "none"}
      <button type="button" disabled={busy} className="underline hover:text-foreground" onClick={setNew}>{isSet ? "change" : "set"}</button>
      {isSet && <button type="button" disabled={busy} className="underline hover:text-foreground" onClick={() => { if (window.confirm("Clear this customer's BM Player PIN?")) void run(null); }}>clear</button>}
    </span>
  );
}
