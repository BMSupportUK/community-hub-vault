import { useEffect, useState } from "react";
import { PoundSterling } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { REFERRAL_REWARDS, formatPounds } from "@/lib/referral-credit";

type Row = { id: string; amount_pence: number; kind: string; referred_name: string | null; package_name: string | null; reason: string | null; created_at: string };

const KIND_LABEL: Record<string, string> = { referral: "Referral reward", spend: "Used on an order", refund: "Returned (order cancelled)", adjust: "Adjusted by BM Support" };

export function ReferralCreditPanel() {
  const { user } = useAuth();
  const [balance, setBalance] = useState<number | null>(null);
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    if (!user) return;
    let off = false;
    void (async () => {
      const [{ data: bal }, { data: list }] = await Promise.all([
        supabase.rpc("my_referral_credit" as never),
        supabase.from("referral_credit_ledger" as never).select("id,amount_pence,kind,referred_name,package_name,reason,created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(50),
      ]);
      if (off) return;
      setBalance(Number(bal ?? 0));
      setRows((list ?? []) as Row[]);
    })();
    return () => { off = true; };
  }, [user?.id]);

  return (
    <section className="mb-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <div className="rounded-2xl border border-purple-500/40 bg-purple-950/50 p-5">
        <div className="flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-xl bg-gradient-to-br from-fuchsia-600 to-purple-600"><PoundSterling className="size-5 text-white" /></div>
          <div>
            <p className="text-sm text-purple-200/80">Your referral credit</p>
            <p className="font-display text-3xl font-bold text-purple-50">{balance === null ? "…" : formatPounds(balance)}</p>
          </div>
        </div>
        <p className="mt-3 text-sm text-purple-200/80">When a new customer you referred pays for their <strong>first order</strong>, credit is added here. When you place an order in the Shop you'll be asked if you want to use it.</p>
        <h3 className="mt-4 text-sm font-semibold text-purple-50">What you get back</h3>
        <table className="mt-2 w-full text-sm">
          <thead><tr className="text-left text-purple-300/80"><th className="py-1 font-medium">Their first order</th><th className="py-1 text-right font-medium">You get</th></tr></thead>
          <tbody>
            {REFERRAL_REWARDS.map((r) => (
              <tr key={r.label} className="border-t border-purple-500/20 text-purple-100">
                <td className="py-1.5">{r.label}</td>
                <td className="py-1.5 text-right font-semibold">{r.pence ? formatPounds(r.pence) : "Nothing"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-purple-300/70">Renewals and later orders don't earn credit.</p>
      </div>
      <div className="rounded-2xl border border-purple-500/40 bg-purple-950/50 p-5">
        <h3 className="text-sm font-semibold text-purple-50">Credit history</h3>
        {rows.length === 0 ? (
          <p className="mt-3 text-sm text-purple-300/70">No credit yet. Share your invite and it'll show here when your friend pays for their first order.</p>
        ) : (
          <ul className="mt-2 divide-y divide-purple-500/20">
            {rows.map((r) => (
              <li key={r.id} className="flex items-start justify-between gap-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="text-purple-100">{r.kind === "spend" && <span className="mr-1 text-emerald-300" aria-label="Used">✓</span>}{KIND_LABEL[r.kind] ?? r.kind}{r.referred_name ? ` · ${r.referred_name}` : ""}</p>
                  <p className="truncate text-xs text-purple-300/70">{new Date(r.created_at).toLocaleDateString("en-GB", { timeZone: "Europe/London" })}{r.package_name ? ` · ${r.package_name}` : r.kind === "adjust" && r.reason ? ` · ${r.reason}` : ""}</p>
                </div>
                <span className={`shrink-0 font-semibold ${r.amount_pence >= 0 ? "text-emerald-300" : "text-purple-200"}`}>{r.amount_pence >= 0 ? "+" : "−"}{formatPounds(Math.abs(r.amount_pence))}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
