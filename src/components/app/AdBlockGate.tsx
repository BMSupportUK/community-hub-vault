import { useState } from "react";
import { ShieldAlert, RefreshCw, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useAdBlockStatus, recheckAdBlock } from "@/hooks/use-adblock";

/**
 * Hides page content behind a notice while an ad blocker is detected.
 * Staff roles are exempt so moderation is never locked out.
 */
export function AdBlockGate({ children }: { children: React.ReactNode }) {
  const { hasAny } = useAuth();
  const status = useAdBlockStatus();
  const [rechecking, setRechecking] = useState(false);
  const [bypassed, setBypassed] = useState(false);
  const isStaff = hasAny(["admin", "management", "staff", "moderator"]);

  if (status !== "blocked" || bypassed) return <>{children}</>;

  const recheck = async () => {
    setRechecking(true);
    try {
      await recheckAdBlock();
    } finally {
      setRechecking(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl rounded-2xl border border-destructive/50 bg-destructive/10 p-6 text-center space-y-4">
      <ShieldAlert className="mx-auto size-10 text-destructive" />
      <h2 className="font-display text-xl font-bold">Please turn off your ad blocker</h2>
      <p className="text-sm text-muted-foreground">
        Our sponsors keep BM Support free to use. Please switch off your ad blocker (or allow
        bmsupport.uk in its settings) to carry on reading, then press Re-check.
      </p>
      <button
        type="button"
        onClick={recheck}
        disabled={rechecking}
        className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
      >
        {rechecking ? (
          <>
            <Loader2 className="size-4 animate-spin" /> Checking…
          </>
        ) : (
          <>
            <RefreshCw className="size-4" /> Re-check
          </>
        )}
      </button>
      {isStaff && (
        <div>
          <button
            type="button"
            onClick={() => setBypassed(true)}
            className="text-xs text-muted-foreground underline hover:text-foreground"
          >
            Continue anyway (staff)
          </button>
        </div>
      )}
    </div>
  );
}
