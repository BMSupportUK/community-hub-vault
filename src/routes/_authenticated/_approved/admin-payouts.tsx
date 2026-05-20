import { createFileRoute, Navigate, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Wallet, Loader2, Copy, Check, Save, ArrowLeft, RefreshCw, ExternalLink, Ban, CheckCircle2,
} from "lucide-react";
import {
  getPayoutSettings,
  updatePayoutSettings,
  listPayouts,
  lockPendingPayoutRates,
  markPayoutSent,
  skipPayout,
  getGbpToUsdtRate,
} from "@/lib/crypto-payouts.functions";

export const Route = createFileRoute("/_authenticated/_approved/admin-payouts")({
  component: AdminPayoutsPage,
});

type Payout = {
  id: string;
  order_id: string;
  status: "pending" | "sent" | "skipped";
  gbp_amount_cents: number;
  gbp_to_usdt_rate: number | null;
  usdt_amount: number | null;
  asset: string;
  network: string;
  wallet_address: string;
  markup_pct: number;
  tx_hash: string | null;
  notes: string | null;
  sent_at: string | null;
  sent_by: string | null;
  created_at: string;
};

type Settings = {
  asset: string;
  network: string;
  wallet_address: string;
  markup_pct: number;
  min_payout_usdt: number;
};

const fmtGbp = (cents: number) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(cents / 100);

const fmtUsdt = (n: number | null) => (n == null ? "—" : `${n.toFixed(2)} USDT`);

function CopyBtn({ value, label = "Copy" }: { value: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setDone(true);
        toast.success(`${label} copied`);
        setTimeout(() => setDone(false), 1500);
      }}
      className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-surface-2 border border-border hover:bg-surface-3"
    >
      {done ? <Check className="size-3" /> : <Copy className="size-3" />} {label}
    </button>
  );
}

function AdminPayoutsPage() {
  const { hasAny } = useAuth();
  const isAdmin = hasAny(["admin", "management"]);
  if (!isAdmin) return <Navigate to="/home" />;

  const getSettings = useServerFn(getPayoutSettings);
  const saveSettings = useServerFn(updatePayoutSettings);
  const fetchList = useServerFn(listPayouts);
  const lockRates = useServerFn(lockPendingPayoutRates);
  const markSent = useServerFn(markPayoutSent);
  const skip = useServerFn(skipPayout);
  const fetchRate = useServerFn(getGbpToUsdtRate);

  const [settings, setSettings] = useState<Settings | null>(null);
  const [pending, setPending] = useState<Payout[]>([]);
  const [sent, setSent] = useState<Payout[]>([]);
  const [rate, setRate] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      await lockRates();
    } catch {}
    const [s, p, sn, r] = await Promise.all([
      getSettings().catch(() => null),
      fetchList({ data: { status: "pending", limit: 200 } }).catch(() => []),
      fetchList({ data: { status: "sent", limit: 100 } }).catch(() => []),
      fetchRate().catch(() => null),
    ]);
    if (s) setSettings({
      asset: s.asset, network: s.network, wallet_address: s.wallet_address,
      markup_pct: Number(s.markup_pct), min_payout_usdt: Number(s.min_payout_usdt),
    });
    setPending(p as Payout[]);
    setSent(sn as Payout[]);
    if (r) setRate(r.gbpPerUsdt);
    setLoading(false);
  }, [getSettings, fetchList, lockRates, fetchRate]);

  useEffect(() => { void refresh(); }, [refresh]);

  // realtime
  useEffect(() => {
    const ch = supabase
      .channel("crypto_payouts_admin")
      .on("postgres_changes", { event: "*", schema: "public", table: "crypto_payouts" }, () => {
        void refresh();
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [refresh]);

  const totalPendingUsdt = useMemo(
    () => pending.reduce((s, p) => s + (p.usdt_amount ?? 0), 0),
    [pending],
  );

  return (
    <main className="flex-1 overflow-y-auto">
      <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/admin" className="size-9 rounded-lg bg-surface-2 border border-border grid place-items-center hover:bg-surface-3">
              <ArrowLeft className="size-4" />
            </Link>
            <div>
              <h1 className="font-display text-2xl font-bold flex items-center gap-2">
                <Wallet className="size-6 text-primary" /> Crypto payouts
              </h1>
              <p className="text-sm text-muted-foreground">
                Manually send USDT to your cold wallet for each paid card order.
                {rate && <> &middot; 1 USDT ≈ £{rate.toFixed(4)}</>}
              </p>
            </div>
          </div>
          <button
            onClick={refresh}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-2 border border-border text-sm hover:bg-surface-3"
          >
            <RefreshCw className="size-4" /> Refresh
          </button>
        </div>

        {loading ? (
          <div className="grid place-items-center py-16 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : (
          <>
            <SettingsCard settings={settings} onSave={async (s) => {
              await saveSettings({ data: s });
              toast.success("Settings saved");
              await refresh();
            }} />

            <section className="rounded-2xl border border-border bg-surface-1 p-5">
              <header className="flex items-center justify-between mb-4">
                <h2 className="font-display text-lg font-bold">
                  Pending payouts ({pending.length})
                </h2>
                <div className="text-sm text-muted-foreground">
                  Total: <span className="text-foreground font-semibold">{totalPendingUsdt.toFixed(2)} USDT</span>
                </div>
              </header>

              {pending.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  No pending payouts. New paid orders appear here automatically.
                </p>
              ) : (
                <ul className="space-y-3">
                  {pending.map((p) => (
                    <PayoutRow
                      key={p.id}
                      p={p}
                      onMarkSent={async (tx, notes) => {
                        await markSent({ data: { id: p.id, tx_hash: tx, notes } });
                        toast.success("Marked as sent");
                        await refresh();
                      }}
                      onSkip={async (notes) => {
                        await skip({ data: { id: p.id, notes } });
                        toast.success("Payout skipped");
                        await refresh();
                      }}
                    />
                  ))}
                </ul>
              )}
            </section>

            <section className="rounded-2xl border border-border bg-surface-1 p-5">
              <h2 className="font-display text-lg font-bold mb-4">Recently sent ({sent.length})</h2>
              {sent.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">Nothing sent yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs uppercase text-muted-foreground">
                      <tr><th className="py-2">When</th><th>Order</th><th>Amount</th><th>Tx hash</th><th>Status</th></tr>
                    </thead>
                    <tbody>
                      {sent.map((p) => (
                        <tr key={p.id} className="border-t border-border">
                          <td className="py-2 pr-3 whitespace-nowrap">{p.sent_at ? new Date(p.sent_at).toLocaleString() : "—"}</td>
                          <td className="pr-3 font-mono text-xs">#{p.order_id.slice(0, 8)}</td>
                          <td className="pr-3">{fmtGbp(p.gbp_amount_cents)} → {fmtUsdt(p.usdt_amount)}</td>
                          <td className="pr-3 font-mono text-xs truncate max-w-[200px]">{p.tx_hash ?? "—"}</td>
                          <td><span className="px-2 py-0.5 rounded text-xs bg-emerald-500/15 text-emerald-400">{p.status}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}

function SettingsCard({
  settings,
  onSave,
}: {
  settings: Settings | null;
  onSave: (s: Settings) => Promise<void>;
}) {
  const [form, setForm] = useState<Settings>(
    settings ?? { asset: "USDT", network: "TRC20", wallet_address: "", markup_pct: 1.5, min_payout_usdt: 0 },
  );
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (settings) setForm(settings); }, [settings]);

  return (
    <section className="rounded-2xl border border-border bg-surface-1 p-5">
      <h2 className="font-display text-lg font-bold mb-1">Payout settings</h2>
      <p className="text-sm text-muted-foreground mb-4">
        Destination wallet and FX buffer. Snapshotted onto each payout at the moment an order is paid.
      </p>
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="text-sm">
          <span className="text-muted-foreground">Asset</span>
          <input value={form.asset} onChange={(e) => setForm({ ...form, asset: e.target.value })} className="w-full mt-1 px-3 py-2 rounded-lg bg-surface-2 border border-border" />
        </label>
        <label className="text-sm">
          <span className="text-muted-foreground">Network</span>
          <select value={form.network} onChange={(e) => setForm({ ...form, network: e.target.value })} className="w-full mt-1 px-3 py-2 rounded-lg bg-surface-2 border border-border">
            <option value="TRC20">TRC20 (Tron) — lowest fee</option>
            <option value="ERC20">ERC20 (Ethereum)</option>
            <option value="BEP20">BEP20 (BNB Chain)</option>
            <option value="POLYGON">Polygon</option>
            <option value="SOL">Solana (SPL)</option>
          </select>
        </label>
        <label className="text-sm sm:col-span-2">
          <span className="text-muted-foreground">Cold wallet address</span>
          <input value={form.wallet_address} onChange={(e) => setForm({ ...form, wallet_address: e.target.value })} placeholder="e.g. T9zk...4f" className="w-full mt-1 px-3 py-2 rounded-lg bg-surface-2 border border-border font-mono text-xs" />
        </label>
        <label className="text-sm">
          <span className="text-muted-foreground">FX markup % (covers exchange spread + network fee)</span>
          <input type="number" step="0.1" min={0} max={50} value={form.markup_pct} onChange={(e) => setForm({ ...form, markup_pct: Number(e.target.value) })} className="w-full mt-1 px-3 py-2 rounded-lg bg-surface-2 border border-border" />
        </label>
        <label className="text-sm">
          <span className="text-muted-foreground">Min payout USDT (0 = no batching)</span>
          <input type="number" step="1" min={0} value={form.min_payout_usdt} onChange={(e) => setForm({ ...form, min_payout_usdt: Number(e.target.value) })} className="w-full mt-1 px-3 py-2 rounded-lg bg-surface-2 border border-border" />
        </label>
      </div>
      <div className="mt-4 flex justify-end">
        <button
          disabled={busy}
          onClick={async () => { setBusy(true); try { await onSave(form); } finally { setBusy(false); } }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-60"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Save settings
        </button>
      </div>
    </section>
  );
}

function PayoutRow({
  p,
  onMarkSent,
  onSkip,
}: {
  p: Payout;
  onMarkSent: (tx: string, notes?: string) => Promise<void>;
  onSkip: (notes?: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [tx, setTx] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <li className="rounded-xl border border-border bg-surface-2 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="font-mono text-xs text-muted-foreground">#{p.order_id.slice(0, 8)} &middot; {new Date(p.created_at).toLocaleString()}</div>
          <div className="font-display font-semibold mt-1">
            {fmtGbp(p.gbp_amount_cents)} → <span className="text-primary">{fmtUsdt(p.usdt_amount)}</span>
            <span className="ml-2 text-xs text-muted-foreground">
              {p.asset} on {p.network}
              {p.gbp_to_usdt_rate && <> &middot; @£{Number(p.gbp_to_usdt_rate).toFixed(4)}/USDT</>}
              {p.markup_pct > 0 && <> &middot; −{Number(p.markup_pct).toFixed(2)}% buffer</>}
            </span>
          </div>
          <div className="text-xs font-mono mt-1 break-all text-muted-foreground">{p.wallet_address || "(no wallet configured)"}</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {p.wallet_address && <CopyBtn value={p.wallet_address} label="Address" />}
          {p.usdt_amount != null && <CopyBtn value={p.usdt_amount.toFixed(2)} label="Amount" />}
          <Link to="/shop" search={{ view: "orders" }} className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-surface-1 border border-border hover:bg-surface-3">
            <ExternalLink className="size-3" /> Order
          </Link>
          <button
            onClick={() => setOpen((v) => !v)}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs bg-primary text-primary-foreground font-medium"
          >
            <CheckCircle2 className="size-3" /> Mark sent
          </button>
          <button
            onClick={async () => {
              if (!confirm("Skip this payout? It will be excluded from the queue.")) return;
              setBusy(true); try { await onSkip(); } finally { setBusy(false); }
            }}
            disabled={busy}
            className="inline-flex items-center gap-1 px-2 py-1.5 rounded-md text-xs bg-surface-1 border border-border hover:bg-surface-3"
          >
            <Ban className="size-3" /> Skip
          </button>
        </div>
      </div>

      {open && (
        <div className="mt-3 pt-3 border-t border-border grid sm:grid-cols-[1fr_auto] gap-2">
          <div className="space-y-2">
            <input
              value={tx}
              onChange={(e) => setTx(e.target.value)}
              placeholder="Transaction hash"
              className="w-full px-3 py-2 rounded-lg bg-surface-1 border border-border text-sm font-mono"
            />
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes (optional)"
              className="w-full px-3 py-2 rounded-lg bg-surface-1 border border-border text-sm"
            />
          </div>
          <button
            disabled={busy || tx.trim().length < 4}
            onClick={async () => {
              setBusy(true);
              try { await onMarkSent(tx.trim(), notes.trim() || undefined); setOpen(false); setTx(""); setNotes(""); }
              catch (e: any) { toast.error(e.message ?? "Failed"); }
              finally { setBusy(false); }
            }}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-60"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : "Confirm sent"}
          </button>
        </div>
      )}
    </li>
  );
}