import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, BarChart3, Loader2, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { ADSENSE_SIDEBAR_SLOT, ADSENSE_TOPIC_SLOT } from "@/lib/adsense";

export const Route = createFileRoute("/_authenticated/_approved/admin-ad-stats")({
  component: AdStatsPage,
  head: () => ({
    meta: [
      { title: "Advert performance — BM Support admin" },
      { name: "description", content: "Impressions and clicks for every advert unit on bmsupport.uk." },
      { property: "og:title", content: "Advert performance — BM Support admin" },
      { property: "og:description", content: "Impressions and clicks for every advert unit on bmsupport.uk." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type Row = {
  day: string;
  slot_key: string;
  ad_slot_id: string;
  page_path: string;
  impressions: number;
  clicks: number;
};

const UNIT_NAMES: Record<string, string> = {
  [ADSENSE_TOPIC_SLOT]: "In-page advert",
  [ADSENSE_SIDEBAR_SLOT]: "Sidebar advert",
  [ADSENSE_WELCOME_SLOT]: "Sports guide welcome advert",
};

const RANGES = [
  { days: 1, label: "Today" },
  { days: 7, label: "Last 7 days" },
  { days: 30, label: "Last 30 days" },
  { days: 90, label: "Last 90 days" },
];

function ctr(impressions: number, clicks: number) {
  if (!impressions) return "—";
  return `${((clicks / impressions) * 100).toFixed(2)}%`;
}

function AdStatsPage() {
  const { hasAny } = useAuth();
  const isAdmin = hasAny(["admin", "management"]);
  const [days, setDays] = useState(30);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async (d: number) => {
    setLoading(true);
    const { data, error } = await supabase.rpc("ad_event_stats", { _days: d });
    setLoading(false);
    if (error) {
      setRows([]);
      return;
    }
    setRows((data ?? []) as Row[]);
  };

  useEffect(() => {
    if (isAdmin) void load(days);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, days]);

  const byUnit = useMemo(() => {
    const map = new Map<string, { impressions: number; clicks: number; slotKey: string }>();
    for (const r of rows ?? []) {
      const cur = map.get(r.ad_slot_id) ?? { impressions: 0, clicks: 0, slotKey: r.slot_key };
      cur.impressions += Number(r.impressions);
      cur.clicks += Number(r.clicks);
      map.set(r.ad_slot_id, cur);
    }
    return [...map.entries()].sort((a, b) => b[1].impressions - a[1].impressions);
  }, [rows]);

  const byPage = useMemo(() => {
    const map = new Map<string, { impressions: number; clicks: number }>();
    for (const r of rows ?? []) {
      const key = `${r.ad_slot_id}||${r.page_path || "/"}`;
      const cur = map.get(key) ?? { impressions: 0, clicks: 0 };
      cur.impressions += Number(r.impressions);
      cur.clicks += Number(r.clicks);
      map.set(key, cur);
    }
    return [...map.entries()]
      .map(([key, v]) => {
        const [adSlotId, page] = key.split("||");
        return { adSlotId: adSlotId ?? "", page: page ?? "/", ...v };
      })
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, 40);
  }, [rows]);

  const byDay = useMemo(() => {
    const map = new Map<string, { impressions: number; clicks: number }>();
    for (const r of rows ?? []) {
      const cur = map.get(r.day) ?? { impressions: 0, clicks: 0 };
      cur.impressions += Number(r.impressions);
      cur.clicks += Number(r.clicks);
      map.set(r.day, cur);
    }
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).slice(0, 30);
  }, [rows]);

  const totals = byUnit.reduce(
    (acc, [, v]) => ({ impressions: acc.impressions + v.impressions, clicks: acc.clicks + v.clicks }),
    { impressions: 0, clicks: 0 },
  );
  const maxDay = Math.max(1, ...byDay.map(([, v]) => v.impressions));

  if (!isAdmin) return <Navigate to="/admin" />;

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link to="/admin" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Back to admin
        </Link>
        <h1 className="font-display text-xl font-bold inline-flex items-center gap-2">
          <BarChart3 className="size-5 text-primary" /> Advert performance
        </h1>
        <div className="ml-auto flex items-center gap-2">
          {RANGES.map((r) => (
            <Button
              key={r.days}
              size="sm"
              variant={days === r.days ? "default" : "outline"}
              onClick={() => setDays(r.days)}
            >
              {r.label}
            </Button>
          ))}
          <Button size="sm" variant="outline" onClick={() => void load(days)} disabled={loading}>
            {loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground max-w-3xl">
        These figures are counted by bmsupport.uk itself: a view is recorded when an advert
        scrolls into sight, and a click when someone presses it. Google's own reports can differ
        slightly because they filter invalid clicks and unfilled adverts.
      </p>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Advert views" value={totals.impressions.toLocaleString("en-GB")} />
        <StatCard label="Clicks" value={totals.clicks.toLocaleString("en-GB")} />
        <StatCard label="Click rate" value={ctr(totals.impressions, totals.clicks)} />
      </div>

      <section className="rounded-2xl border border-border bg-surface-1 p-4">
        <h2 className="font-display font-bold mb-3">By advert unit</h2>
        {rows === null ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : byUnit.length === 0 ? (
          <div className="text-sm text-muted-foreground">No advert activity recorded yet for this period.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="text-left py-2">Unit</th>
                  <th className="text-left py-2">ID</th>
                  <th className="text-right py-2">Views</th>
                  <th className="text-right py-2">Clicks</th>
                  <th className="text-right py-2">Click rate</th>
                </tr>
              </thead>
              <tbody>
                {byUnit.map(([id, v]) => (
                  <tr key={id} className="border-t border-border/60">
                    <td className="py-2 font-medium">{UNIT_NAMES[id] ?? v.slotKey}</td>
                    <td className="py-2 text-muted-foreground">{id}</td>
                    <td className="py-2 text-right">{v.impressions.toLocaleString("en-GB")}</td>
                    <td className="py-2 text-right">{v.clicks.toLocaleString("en-GB")}</td>
                    <td className="py-2 text-right">{ctr(v.impressions, v.clicks)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="rounded-2xl border border-border bg-surface-1 p-4">
          <h2 className="font-display font-bold mb-3">Day by day</h2>
          {byDay.length === 0 ? (
            <div className="text-sm text-muted-foreground">Nothing recorded yet.</div>
          ) : (
            <ul className="space-y-2">
              {byDay.map(([day, v]) => (
                <li key={day} className="text-xs">
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">
                      {new Date(`${day}T00:00:00Z`).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                    </span>
                    <span>
                      {v.impressions.toLocaleString("en-GB")} views · {v.clicks.toLocaleString("en-GB")} clicks
                    </span>
                  </div>
                  <div className="mt-1 h-2 rounded-full bg-surface-2 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-primary"
                      style={{ width: `${Math.round((v.impressions / maxDay) * 100)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border border-border bg-surface-1 p-4">
          <h2 className="font-display font-bold mb-3">Top pages</h2>
          {byPage.length === 0 ? (
            <div className="text-sm text-muted-foreground">Nothing recorded yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="text-left py-2">Page</th>
                    <th className="text-left py-2">Unit</th>
                    <th className="text-right py-2">Views</th>
                    <th className="text-right py-2">Clicks</th>
                  </tr>
                </thead>
                <tbody>
                  {byPage.map((r) => (
                    <tr key={`${r.adSlotId}-${r.page}`} className="border-t border-border/60">
                      <td className="py-2 break-all">{r.page}</td>
                      <td className="py-2 text-muted-foreground">{UNIT_NAMES[r.adSlotId] ?? r.adSlotId}</td>
                      <td className="py-2 text-right">{r.impressions.toLocaleString("en-GB")}</td>
                      <td className="py-2 text-right">{r.clicks.toLocaleString("en-GB")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface-1 p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 font-display text-2xl font-bold">{value}</div>
    </div>
  );
}
