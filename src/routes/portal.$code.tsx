import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ShoppingCart } from "lucide-react";
import { PortalCodeForm } from "@/components/app/PortalCodeForm";
import { supabase } from "@/integrations/supabase/client";
import { requestPortalCode, redeemPortalCode } from "@/lib/customer-portal.functions";
import { PORTAL_EXPIRY_KEY, PORTAL_USER_KEY } from "@/lib/customer-portal";

export const Route = createFileRoute("/portal/$code")({
  component: PortalEntry,
  head: () => ({ meta: [
    { title: "Customer Portal Login | BM Support" },
    { name: "description", content: "Enter your emailed login code to securely unlock your BM Support customer portal." },
    { property: "og:title", content: "Customer Portal Login | BM Support" },
    { property: "og:description", content: "Enter your emailed login code to securely unlock your BM Support customer portal." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex, nofollow" },
  ] }),
});

function PortalEntry() {
  const { code } = Route.useParams();
  const navigate = useNavigate();
  const request = useServerFn(requestPortalCode), redeem = useServerFn(redeemPortalCode);
  async function unlock(loginCode: string) {
    const r = await redeem({ data: { code, loginCode } });
    await supabase.auth.signOut({ scope: "local" });
    const { data, error } = await supabase.auth.verifyOtp({ token_hash: r.tokenHash, type: "magiclink" });
    if (error || !data.user) throw new Error("We couldn't sign you in. Request a new code.");
    window.localStorage.setItem(PORTAL_USER_KEY, data.user.id);
    window.localStorage.setItem(PORTAL_EXPIRY_KEY, r.expiresAt);
    window.dispatchEvent(new Event("bm-portal-lock-change"));
    await navigate({ to: "/shop", replace: true });
  }
  return <main className="grid min-h-dvh place-items-center bg-background px-4 text-foreground">
    <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-lg">
      <div className="mb-4 flex items-center gap-3"><div className="grid size-11 place-items-center rounded-lg bg-gradient-primary"><ShoppingCart className="size-5 text-primary-foreground" /></div><div><p className="text-xs text-muted-foreground">BM Support</p><h1 className="font-display text-2xl font-bold">Customer Portal</h1></div></div>
      <p className="text-sm text-muted-foreground">Enter your emailed login code. Your code lasts 24 hours, and portal access locks again after one hour.</p>
      <PortalCodeForm onSend={() => request({ data: { code } })} onUnlock={unlock} />
    </div>
  </main>;
}
