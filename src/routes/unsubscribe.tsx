import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/unsubscribe")({
  component: UnsubscribePage,
  validateSearch: (s: Record<string, unknown>) => ({ token: (s.token as string) ?? "" }),
});

function UnsubscribePage() {
  const { token } = Route.useSearch();
  const [state, setState] = useState<"loading" | "valid" | "used" | "invalid" | "done" | "error">("loading");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) return setState("invalid");
    (async () => {
      try {
        const r = await fetch(`/email/unsubscribe?token=${encodeURIComponent(token)}`);
        const j = await r.json().catch(() => ({}));
        if (r.ok && j.valid) setState("valid");
        else if (j.used) setState("used");
        else setState("invalid");
      } catch {
        setState("error");
      }
    })();
  }, [token]);

  const confirm = async () => {
    setBusy(true);
    try {
      const r = await fetch("/email/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      setState(r.ok ? "done" : "error");
    } catch { setState("error"); }
    setBusy(false);
  };

  return (
    <div className="min-h-screen grid place-items-center bg-background px-4">
      <div className="max-w-md w-full bg-surface border border-border rounded-2xl p-8 text-center">
        <h1 className="font-display text-2xl font-bold mb-3">Unsubscribe</h1>
        {state === "loading" && <p className="text-sm text-muted-foreground">Checking link…</p>}
        {state === "valid" && (
          <>
            <p className="text-sm text-muted-foreground mb-6">Confirm to stop receiving emails from us.</p>
            <button disabled={busy} onClick={confirm} className="h-11 px-5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50">
              {busy ? "Unsubscribing…" : "Confirm unsubscribe"}
            </button>
          </>
        )}
        {state === "used" && <p className="text-sm text-muted-foreground">You are already unsubscribed.</p>}
        {state === "done" && <p className="text-sm text-green-500">You have been unsubscribed.</p>}
        {state === "invalid" && <p className="text-sm text-destructive">This unsubscribe link is invalid.</p>}
        {state === "error" && <p className="text-sm text-destructive">Something went wrong. Try again later.</p>}
      </div>
    </div>
  );
}