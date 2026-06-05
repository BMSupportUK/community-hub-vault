import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { ExternalLink, Tv, Cpu, MemoryStick, HardDrive, Wifi, Settings } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import firestickCompatibility from "@/assets/firestick-compatibility.png.asset.json";

export const Route = createFileRoute("/_authenticated/_approved/streaming-devices")({
  component: StreamingDevicesPage,
});

type Device = {
  id: string;
  name: string;
  brand: string | null;
  tier: "high" | "medium" | "low";
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
  source_url: string | null;
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

function retailerFromUrl(raw: string | null | undefined) {
  if (!raw) return null;
  try {
    return new URL(raw).hostname.replace(/^www\./, "").split(".")[0].replace(/[-_]+/g, " ");
  } catch {
    return null;
  }
}

function isFireDevice(device: Device) {
  return device.brand?.toLowerCase() === "amazon" || /fire\s*tv|fire\s*stick|firestick/i.test(device.name);
}

function isStick(device: Device) {
  return /stick|dongle/i.test(device.name) || /stick|dongle/i.test(device.summary ?? "");
}

function DeviceCard({ device, price }: { device: Device; price: Price | undefined }) {
  const priceLabel = price ? formatPrice(price.price_cents, price.currency) : null;
  const listingUrl = price?.source_url || device.amazon_url;
  const retailer = retailerFromUrl(listingUrl);
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
          {listingUrl ? (
            <Button asChild className="w-full">
              <a href={listingUrl} target="_blank" rel="sponsored noopener noreferrer">
                <ExternalLink className="size-4" />
                {priceLabel ? `Best found${retailer ? ` at ${retailer}` : ""} — ${priceLabel}` : `View${retailer ? ` ${retailer}` : " retailer"} listing`}
              </a>
            </Button>
          ) : (
            <Button className="w-full" disabled>
              Price unavailable
            </Button>
          )}
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
        .select("device_id, price_cents, currency, availability, source_url, scraped_at");
      if (error) throw error;
      return (data ?? []) as Price[];
    },
  });

  const priceMap = useMemo(() => {
    const m = new Map<string, Price>();
    (pricesQuery.data ?? []).forEach((p) => m.set(p.device_id, p));
    return m;
  }, [pricesQuery.data]);

  const allDevices = devicesQuery.data ?? [];
  const androidNonFire = allDevices.filter((d) => !isFireDevice(d));
  const boxes = androidNonFire.filter((d) => !isStick(d));
  const boxHigh = boxes.filter((d) => d.tier === "high");
  const boxMedium = boxes.filter((d) => d.tier === "medium");
  const boxLow = boxes.filter((d) => d.tier === "low");
  const androidSticks = androidNonFire.filter(isStick);
  const stickHigh = androidSticks.filter((d) => d.tier === "high");
  const stickMedium = androidSticks.filter((d) => d.tier === "medium");
  const stickLow = androidSticks.filter((d) => d.tier === "low");
  const fireSticks = allDevices.filter(isFireDevice);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="w-full px-4 sm:px-6 lg:px-8 py-6 space-y-8">
        <header className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Streaming device reviews</h1>
          <p className="text-muted-foreground max-w-2xl">
            Hand-picked Android TV / Google TV boxes that all support sideloading. Prices refresh
            weekly from UK retailers.
          </p>
        </header>

        {devicesQuery.isLoading && <div className="text-muted-foreground">Loading devices…</div>}

        <Tabs defaultValue="android" className="space-y-6">
          <TabsList>
            <TabsTrigger value="android">Android Boxes</TabsTrigger>
            <TabsTrigger value="android-sticks">Android Sticks</TabsTrigger>
            <TabsTrigger value="amazon">Fire Sticks</TabsTrigger>
          </TabsList>

          <TabsContent value="android" className="space-y-8">
            {boxLow.length > 0 && (
              <section className="space-y-4">
                <div className="flex items-baseline justify-between">
                  <h2 className="text-xl font-semibold">Low spec</h2>
                  <span className="text-xs text-muted-foreground">Budget picks that still stream well</span>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {boxLow.map((d) => (
                    <DeviceCard key={d.id} device={d} price={priceMap.get(d.id)} />
                  ))}
                </div>
              </section>
            )}

            {boxMedium.length > 0 && (
              <section className="space-y-4">
                <div className="flex items-baseline justify-between">
                  <h2 className="text-xl font-semibold">Medium spec</h2>
                  <span className="text-xs text-muted-foreground">Great value, solid for most users</span>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {boxMedium.map((d) => (
                    <DeviceCard key={d.id} device={d} price={priceMap.get(d.id)} />
                  ))}
                </div>
              </section>
            )}

            {boxHigh.length > 0 && (
              <section className="space-y-4">
                <div className="flex items-baseline justify-between">
                  <h2 className="text-xl font-semibold">High spec</h2>
                  <span className="text-xs text-muted-foreground">Best performance, top-end hardware</span>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {boxHigh.map((d) => (
                    <DeviceCard key={d.id} device={d} price={priceMap.get(d.id)} />
                  ))}
                </div>
              </section>
            )}

          </TabsContent>

          <TabsContent value="android-sticks" className="space-y-8">
            {stickLow.length > 0 && (
              <section className="space-y-4">
                <div className="flex items-baseline justify-between">
                  <h2 className="text-xl font-semibold">Low spec</h2>
                  <span className="text-xs text-muted-foreground">Budget dongles that still stream well</span>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {stickLow.map((d) => (
                    <DeviceCard key={d.id} device={d} price={priceMap.get(d.id)} />
                  ))}
                </div>
              </section>
            )}
            {stickMedium.length > 0 && (
              <section className="space-y-4">
                <div className="flex items-baseline justify-between">
                  <h2 className="text-xl font-semibold">Medium spec</h2>
                  <span className="text-xs text-muted-foreground">Reliable 4K HDR sticks for most users</span>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {stickMedium.map((d) => (
                    <DeviceCard key={d.id} device={d} price={priceMap.get(d.id)} />
                  ))}
                </div>
              </section>
            )}
            {stickHigh.length > 0 && (
              <section className="space-y-4">
                <div className="flex items-baseline justify-between">
                  <h2 className="text-xl font-semibold">High spec</h2>
                  <span className="text-xs text-muted-foreground">Top-tier dongles for serious streaming</span>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {stickHigh.map((d) => (
                    <DeviceCard key={d.id} device={d} price={priceMap.get(d.id)} />
                  ))}
                </div>
              </section>
            )}
            {androidSticks.length === 0 && (
              <p className="text-sm text-muted-foreground">No Android sticks listed yet.</p>
            )}
          </TabsContent>

          <TabsContent value="amazon" className="space-y-6">
            <section className="space-y-3">
              <h2 className="text-xl font-semibold">Fire TV Stick compatibility</h2>
              <p className="text-sm text-muted-foreground max-w-2xl">
                Quick reference for which Amazon Fire TV Sticks still allow sideloading.
              </p>
              <div className="grid gap-4 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,2.2fr)] items-start">
                {fireSticks.map((d) => (
                  <DeviceCard key={d.id} device={d} price={priceMap.get(d.id)} />
                ))}
                <Dialog>
                  <DialogTrigger asChild>
                    <button
                      type="button"
                      className="rounded-xl overflow-hidden border border-border bg-surface-2 cursor-zoom-in transition hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-ring"
                      aria-label="Open compatibility chart"
                    >
                      <img
                        src={firestickCompatibility.url}
                        alt="Fire TV Stick compatibility chart"
                        className="w-full h-auto"
                        loading="lazy"
                      />
                    </button>
                  </DialogTrigger>
                  <DialogContent className="max-w-[95vw] w-fit p-2 sm:p-4">
                    <img
                      src={firestickCompatibility.url}
                      alt="Fire TV Stick compatibility chart"
                      className="w-auto max-h-[85vh] h-auto rounded-md"
                    />
                  </DialogContent>
                </Dialog>
              </div>
            </section>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}