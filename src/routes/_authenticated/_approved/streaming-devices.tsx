import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { ExternalLink, Tv, Cpu, MemoryStick, HardDrive, Wifi, Settings } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import firestickCompatibility from "@/assets/firestick-compatibility.png.asset.json";

export const Route = createFileRoute("/_authenticated/_approved/streaming-devices")({
  component: StreamingDevicesPage,
});

type Device = {
  id: string;
  name: string;
  brand: string | null;
  tier: "high" | "medium";
  image_url: string | null;
  summary: string | null;
  specs: Record<string, string> | null;
  sideload_notes: string | null;
  amazon_url: string;
  sort_order: number;
  price_range_low_cents: number | null;
  price_range_high_cents: number | null;
  price_range_currency: string | null;
};

type Price = {
  device_id: string;
  price_cents: number | null;
  currency: string;
  availability: string | null;
  scraped_at: string;
};

const SPEC_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  cpu: Cpu,
  ram: MemoryStick,
  storage: HardDrive,
  wifi: Wifi,
  os: Settings,
};

function formatPrice(cents: number | null, currency: string) {
  if (cents == null) return null;
  try {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(cents / 100);
  } catch {
    return `£${(cents / 100).toFixed(2)}`;
  }
}

function formatRange(
  low: number | null,
  high: number | null,
  currency: string | null,
): string | null {
  if (low == null && high == null) return null;
  const ccy = currency || "GBP";
  const lo = formatPrice(low, ccy);
  const hi = formatPrice(high, ccy);
  if (lo && hi && low !== high) return `${lo} – ${hi}`;
  return lo || hi;
}

function relTime(iso: string) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "Updated today";
  if (days === 1) return "Updated 1 day ago";
  if (days < 30) return `Updated ${days} days ago`;
  return `Updated ${Math.floor(days / 7)} weeks ago`;
}

function DeviceCard({ device, price }: { device: Device; price: Price | undefined }) {
  const priceLabel = price ? formatPrice(price.price_cents, price.currency) : null;
  const rangeLabel = formatRange(
    device.price_range_low_cents,
    device.price_range_high_cents,
    device.price_range_currency,
  );
  const specs = device.specs ?? {};
  return (
    <article className="rounded-xl border border-border bg-card overflow-hidden flex flex-col">
      <div className="aspect-video bg-surface-2 flex items-center justify-center overflow-hidden">
        {device.image_url ? (
          <img
            src={device.image_url}
            alt={device.name}
            className="w-full h-full object-contain"
            loading="lazy"
          />
        ) : (
          <Tv className="size-12 text-muted-foreground" />
        )}
      </div>
      <div className="p-4 flex-1 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            {device.brand && <div className="text-xs uppercase tracking-wide text-muted-foreground">{device.brand}</div>}
            <h3 className="text-lg font-semibold leading-tight">{device.name}</h3>
          </div>
          {price && (
            <Badge variant="secondary" className="shrink-0 text-[10px]">{relTime(price.scraped_at)}</Badge>
          )}
        </div>

        {rangeLabel && (
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-semibold tracking-tight">{rangeLabel}</span>
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Typical price</span>
          </div>
        )}

        {device.summary && <p className="text-sm text-muted-foreground">{device.summary}</p>}

        {Object.keys(specs).length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(specs).slice(0, 8).map(([k, v]) => {
              const Icon = SPEC_ICONS[k.toLowerCase()];
              return (
                <span key={k} className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-2 py-0.5 text-xs">
                  {Icon && <Icon className="size-3" />}
                  <span className="text-muted-foreground capitalize">{k}:</span>
                  <span>{v}</span>
                </span>
              );
            })}
          </div>
        )}

        {device.sideload_notes && (
          <div className="text-xs text-muted-foreground border-l-2 border-primary/40 pl-2">
            <span className="font-medium text-foreground">Sideload: </span>{device.sideload_notes}
          </div>
        )}

        <div className="mt-auto pt-2">
          <Button asChild className="w-full">
            <a href={device.amazon_url} target="_blank" rel="sponsored noopener noreferrer">
              <ExternalLink className="size-4" />
              {priceLabel ? `Best price on Amazon — ${priceLabel}` : "View on Amazon"}
            </a>
          </Button>
        </div>
      </div>
    </article>
  );
}

function StreamingDevicesPage() {
  const devicesQuery = useQuery({
    queryKey: ["streaming-devices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("streaming_devices")
        .select("id, name, brand, tier, image_url, summary, specs, sideload_notes, amazon_url, sort_order, price_range_low_cents, price_range_high_cents, price_range_currency")
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as Device[];
    },
  });

  const pricesQuery = useQuery({
    queryKey: ["streaming-device-prices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("streaming_device_prices")
        .select("device_id, price_cents, currency, availability, scraped_at");
      if (error) throw error;
      return (data ?? []) as Price[];
    },
  });

  const priceMap = useMemo(() => {
    const m = new Map<string, Price>();
    (pricesQuery.data ?? []).forEach((p) => m.set(p.device_id, p));
    return m;
  }, [pricesQuery.data]);

  const high = (devicesQuery.data ?? []).filter((d) => d.tier === "high");
  const medium = (devicesQuery.data ?? []).filter((d) => d.tier === "medium");

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-8">
        <header className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Streaming device reviews</h1>
          <p className="text-muted-foreground max-w-2xl">
            Hand-picked Android TV / Google TV boxes that all support sideloading. Prices refresh
            weekly from Amazon UK.
          </p>
        </header>

        {devicesQuery.isLoading && <div className="text-muted-foreground">Loading devices…</div>}

        {high.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-baseline justify-between">
              <h2 className="text-xl font-semibold">High spec</h2>
              <span className="text-xs text-muted-foreground">Best performance, top-end hardware</span>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {high.map((d) => (
                <DeviceCard key={d.id} device={d} price={priceMap.get(d.id)} />
              ))}
            </div>
          </section>
        )}

        {medium.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-baseline justify-between">
              <h2 className="text-xl font-semibold">Medium spec</h2>
              <span className="text-xs text-muted-foreground">Great value, solid for most users</span>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {medium.map((d) => (
                <DeviceCard key={d.id} device={d} price={priceMap.get(d.id)} />
              ))}
            </div>
          </section>
        )}

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Fire TV Stick compatibility</h2>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Quick reference for which Amazon Fire TV Sticks still allow sideloading.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              {
                name: "Fire TV Stick 4K Max",
                desc: "Recommended — fastest, Wi-Fi 6E, sideloading supported.",
                url: "https://www.amazon.co.uk/dp/B0BP9SNVH9",
              },
              {
                name: "Fire TV Stick 4K (Plus)",
                desc: "Solid 4K performance, sideloading supported.",
                url: "https://www.amazon.co.uk/dp/B0BP9MXCFB",
              },
            ].map((s) => (
              <a
                key={s.name}
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-xl border border-border bg-surface-2 p-4 hover:border-primary transition-colors"
              >
                <div className="font-medium">{s.name}</div>
                <p className="text-sm text-muted-foreground mt-1">{s.desc}</p>
                <span className="text-sm text-primary mt-2 inline-block">Buy on Amazon →</span>
              </a>
            ))}
          </div>
          <div className="rounded-xl overflow-hidden border border-border bg-surface-2">
            <img
              src={firestickCompatibility.url}
              alt="Fire TV Stick compatibility chart: HD 2026 and 4K Select do not allow sideloading; 4K Plus and 4K Max do."
              className="w-full h-auto"
              loading="lazy"
            />
          </div>
        </section>
      </div>
    </div>
  );
}