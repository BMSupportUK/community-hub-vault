import { useCallback, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Landmark, CreditCard, Loader2, ShieldCheck } from "lucide-react";
import { vpnPayConfirm, vpnPaySummary } from "@/lib/vpn-pay.functions";
import { PayByBankSection } from "@/components/checkout/PayByBankSection";
import { CheckoutCardPayment } from "@/components/checkout/CheckoutCardPayment";
import { warmSquareCardEntry } from "@/lib/square-card-sdk";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/vpn-pay/$token")({
  head: () => ({
    meta: [
      { title: "Pay for your BM VPN — BM Support" },
      { name: "description", content: "Pay for the VPN you chose in BM Player. It switches on in the app as soon as payment completes." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Pay for your BM VPN — BM Support" },
      { property: "og:description", content: "Pay for the VPN you chose in BM Player." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: VpnPayPage,
});

type Summary = { pence: number; days: number; until: string; ref: string; paid: boolean; confirm?: boolean };
const money = (p: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(p / 100);
const day = (iso: string) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" }) : "");

function VpnPayPage() {
  const { token } = Route.useParams();
  const summary = useServerFn(vpnPaySummary);
  const confirmBuy = useServerFn(vpnPayConfirm);
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState<string | null>(null);
  const [info, setInfo] = useState<Summary | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [method, setMethod] = useState<"bank" | "card">("bank");

  // The box puts the link password after "#"; keep it for this tab so a bank app's return still works.
  useEffect(() => {
    const key = `vpn-pay:${token}`;
    const fromHash = decodeURIComponent(window.location.hash.replace(/^#/, ""));
    if (fromHash) { sessionStorage.setItem(key, fromHash); history.replaceState(null, "", window.location.pathname + window.location.search); }
    setPassword(fromHash || sessionStorage.getItem(key) || "");
    warmSquareCardEntry();
  }, [token]);

  const load = useCallback(async () => {
    if (!password) return;
    try {
      const r = await summary({ data: { token, password } });
      if ("error" in r) setErr(r.error ?? "Something went wrong"); else { setErr(null); setInfo(r as Summary); }
    } catch { setErr("Couldn't load the payment. Check your connection and try again."); }
  }, [password, summary, token]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!info || info.paid || info.confirm) return;
    const t = setInterval(() => void load(), 5000);
    return () => clearInterval(t);
  }, [info, load]);

  const onConfirm = async () => {
    if (!password || busy) return;
    setBusy(true);
    try {
      const r = await confirmBuy({ data: { token, password } });
      if ("error" in r) { setErr(r.error ?? "Something went wrong"); setBusy(false); return; }
      sessionStorage.setItem(`vpn-pay:${r.token}`, r.password);
      window.location.replace(`/vpn-pay/${r.token}`);
    } catch { setErr("Couldn't start the purchase. Check your connection and try again."); setBusy(false); }
  };

  return (
    <main className="min-h-dvh bg-background px-4 py-8 text-foreground">
      <div className="mx-auto max-w-lg space-y-5">
        <header className="flex items-center gap-3">
          <div className="grid size-12 place-items-center rounded-lg border border-accent/40 bg-card text-accent"><ShieldCheck className="size-6" /></div>
          <div>
            <p className="text-xs font-semibold text-muted-foreground">BM PLAYER · VPN</p>
            <h1 className="font-display text-2xl font-bold">Pay for your VPN</h1>
          </div>
        </header>

        {password === "" && <p className="rounded-lg border border-border bg-card p-4 text-sm">Open this page by scanning the QR code on your BM Player. Press <b>Get VPN</b> there for a new code.</p>}
        {err && <p className="rounded-lg border border-destructive/50 bg-card p-4 text-sm text-destructive">{err}</p>}
        {!info && !err && password && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Loading…</div>}

        {info && (
          <section className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-soft">
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div><dt className="text-muted-foreground">Price</dt><dd className="text-2xl font-bold tabular-nums">{money(info.pence)}</dd></div>
              <div><dt className="text-muted-foreground">Covers</dt><dd className="font-semibold">{info.days} days</dd></div>
              <div className="col-span-2"><dt className="text-muted-foreground">Ends with your subscription on</dt><dd className="font-semibold">{day(info.until)}</dd></div>
            </dl>
            <p className="text-xs text-muted-foreground">£2 a month, charged by the day for the time left on your subscription.</p>

            {info.confirm ? (
              <div className="space-y-3 rounded-lg border border-border bg-background p-4">
                <p className="font-semibold">Do you want to buy the VPN for {money(info.pence)}?</p>
                <p className="text-sm text-muted-foreground">Nothing is ordered until you confirm. If you didn't mean to, just close this page.</p>
                <Button type="button" className="w-full" disabled={busy} onClick={onConfirm}>{busy ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}Yes, buy the VPN</Button>
              </div>
            ) : info.paid ? (
              <div className="flex items-start gap-3 rounded-lg border border-success/50 bg-background p-4">
                <CheckCircle2 className="size-6 shrink-0 text-success" />
                <div><p className="font-semibold">Paid — thank you</p><p className="text-sm text-muted-foreground">Your VPN is ready in BM Player. Press the VPN button on the home screen to switch it on.</p></div>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="How to pay">
                  <Button type="button" variant={method === "bank" ? "default" : "outline"} aria-pressed={method === "bank"} onClick={() => setMethod("bank")}><Landmark className="size-4" />Pay by bank</Button>
                  <Button type="button" variant={method === "card" ? "default" : "outline"} aria-pressed={method === "card"} onClick={() => setMethod("card")}><CreditCard className="size-4" />Card (Square)</Button>
                </div>
                {method === "bank"
                  ? <PayByBankSection token={token} password={password ?? ""} hideCardNote />
                  : <CheckoutCardPayment token={token} password={password ?? ""} method="square" amountCents={info.pence} onPaid={load} />}
              </>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
