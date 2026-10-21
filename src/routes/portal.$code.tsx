import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Mail, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { requestPortalLink, redeemPortalLink } from "@/lib/customer-portal.functions";
import { PORTAL_EXPIRY_KEY } from "@/lib/customer-portal";

export const Route = createFileRoute("/portal/$code")({
  validateSearch: (s: Record<string, unknown>): { t?: string } => ({ t: typeof s.t === "string" ? s.t : undefined }),
  component: PortalEntry,
  head: () => ({ meta: [
    { title: "Customer Portal Login | BM Support" },
    { name: "description", content: "Request a secure 24-hour login link to your BM Support customer portal." },
    { property: "og:title", content: "Customer Portal Login | BM Support" },
    { property: "og:description", content: "Request a secure 24-hour login link to your BM Support customer portal." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex, nofollow" },
  ] }),
});

function PortalEntry() {
  const { code } = Route.useParams();
  const { t } = Route.useSearch();
  const navigate = useNavigate();
  const request = useServerFn(requestPortalLink), redeem = useServerFn(redeemPortalLink);
  const [busy, setBusy] = useState(false), [sent, setSent] = useState(false), [error, setError] = useState(""), [opening, setOpening] = useState(!!t);
  const ran = useRef(false);
  useEffect(() => {
    if (!t || ran.current) return; ran.current = true;
    (async () => {
      try {
        const r = await redeem({ data: { code, token: t } });
        await supabase.auth.signOut({ scope: "local" });
        const { error: otpError } = await supabase.auth.verifyOtp({ token_hash: r.tokenHash, type: "magiclink" });
        if (otpError) throw new Error("We couldn't sign you in. Request a new link.");
        window.localStorage.setItem(PORTAL_EXPIRY_KEY, r.expiresAt);
        navigate({ to: "/shop", replace: true });
      } catch (e) { setError(e instanceof Error ? e.message : "This link no longer works."); setOpening(false); navigate({ to: "/portal/$code", params: { code }, search: {}, replace: true }); }
    })();
  }, [t, code, redeem, navigate]);
  async function send() {
    setBusy(true); setError("");
    try { await request({ data: { code } }); setSent(true); } catch (e) { setError(e instanceof Error ? e.message : "Please try again."); } finally { setBusy(false); }
  }
  return <main className="grid min-h-dvh place-items-center bg-background px-4 text-foreground">
    <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-lg">
      <div className="mb-4 flex items-center gap-3"><div className="grid size-11 place-items-center rounded-lg bg-gradient-primary"><ShoppingCart className="size-5 text-primary-foreground" /></div><div><p className="text-xs text-muted-foreground">BM Support</p><h1 className="font-display text-2xl font-bold">Customer Portal</h1></div></div>
      {opening ? <p className="flex items-center gap-2 text-sm"><Loader2 className="size-4 animate-spin" />Opening your portal…</p> : sent ? <p role="status" className="text-sm">If this is your portal, a login link is on its way to your email. The link lasts 24 hours, and the portal locks again one hour after each opening. Check your spam folder too.</p> : <>
        <p className="mb-5 text-sm text-muted-foreground">Your shop, orders, app logins and install guides. We'll email you a login link that lasts 24 hours. Each time you open it, the portal locks again after an hour.</p>
        <Button className="w-full" disabled={busy} onClick={send}>{busy ? <Loader2 className="animate-spin" /> : <Mail />}Send me a login link</Button>
      </>}
      {sent && <Button variant="ghost" className="mt-3 w-full" disabled={busy} onClick={send}>Send a new link</Button>}
      {error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
    </div>
  </main>;
}
