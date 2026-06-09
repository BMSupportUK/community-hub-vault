import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ExternalLink, Tv, Cpu, MemoryStick, HardDrive, Wifi, Settings, Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import firestickCompatibility from "@/assets/firestick-compatibility.png.asset.json";
import tvLoginIllustration from "@/assets/tv-login-illustration.jpg";

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

type RatingRow = {
  device_id: string;
  user_id: string;
  rating: number;
};

type RatingSummary = { average: number; count: number; mine: number | null };

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

function StarRating({
  summary,
  onRate,
  disabled,
}: {
  summary: RatingSummary;
  onRate: (n: number) => void;
  disabled?: boolean;
}) {
  const [hover, setHover] = useState(0);
  const display = hover || summary.mine || Math.round(summary.average);
  return (
    <div className="flex items-center gap-2">
      <div className="flex" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => {
          const filled = n <= display;
          return (
            <button
              key={n}
              type="button"
              disabled={disabled}
              onMouseEnter={() => setHover(n)}
              onClick={() => onRate(n)}
              className="p-0.5 disabled:cursor-not-allowed"
              aria-label={`Rate ${n} star${n > 1 ? "s" : ""}`}
            >
              <Star
                className={`size-4 transition-colors ${filled ? "fill-amber-400 text-amber-400" : "text-muted-foreground"}`}
              />
            </button>
          );
        })}
      </div>
      <span className="text-xs text-muted-foreground">
        {summary.count > 0 ? `${summary.average.toFixed(1)} (${summary.count})` : "No ratings yet"}
      </span>
    </div>
  );
}

function DeviceCard({
  device,
  price,
  ratingSummary,
  onRate,
  rateDisabled,
}: {
  device: Device;
  price: Price | undefined;
  ratingSummary: RatingSummary;
  onRate: (deviceId: string, rating: number) => void;
  rateDisabled?: boolean;
}) {
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

        {device.summary && <p className="text-sm text-muted-foreground">{device.summary}</p>}

        <StarRating
          summary={ratingSummary}
          onRate={(n) => onRate(device.id, n)}
          disabled={rateDisabled}
        />

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
                {priceLabel ? `Buying from our streaming partner — ${priceLabel}` : `Buying from our streaming partner${retailer ? ` (${retailer})` : ""}`}
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

export function StreamingDevicesPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
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

  const ratingsQuery = useQuery({
    queryKey: ["streaming-device-ratings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("streaming_device_ratings")
        .select("device_id, user_id, rating");
      if (error) throw error;
      return (data ?? []) as RatingRow[];
    },
  });

  const ratingSummaryMap = useMemo(() => {
    const m = new Map<string, RatingSummary>();
    const rows = ratingsQuery.data ?? [];
    const byDevice = new Map<string, RatingRow[]>();
    rows.forEach((r) => {
      const arr = byDevice.get(r.device_id) ?? [];
      arr.push(r);
      byDevice.set(r.device_id, arr);
    });
    byDevice.forEach((arr, deviceId) => {
      const count = arr.length;
      const average = count ? arr.reduce((s, r) => s + r.rating, 0) / count : 0;
      const mine = user ? arr.find((r) => r.user_id === user.id)?.rating ?? null : null;
      m.set(deviceId, { average, count, mine });
    });
    return m;
  }, [ratingsQuery.data, user]);

  const rateMutation = useMutation({
    mutationFn: async ({ deviceId, rating }: { deviceId: string; rating: number }) => {
      if (!user) throw new Error("Sign in to rate");
      const { error } = await supabase
        .from("streaming_device_ratings")
        .upsert({ device_id: deviceId, user_id: user.id, rating }, { onConflict: "device_id,user_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["streaming-device-ratings"] });
      toast.success("Rating saved");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save rating"),
  });

  const handleRate = (deviceId: string, rating: number) => {
    if (!user) {
      toast.error("Sign in to rate");
      return;
    }
    rateMutation.mutate({ deviceId, rating });
  };

  const summaryFor = (id: string): RatingSummary =>
    ratingSummaryMap.get(id) ?? { average: 0, count: 0, mine: null };

  const renderCard = (d: Device) => (
    <DeviceCard
      key={d.id}
      device={d}
      price={priceMap.get(d.id)}
      ratingSummary={summaryFor(d.id)}
      onRate={handleRate}
      rateDisabled={rateMutation.isPending}
    />
  );

  const priceMap = useMemo(() => {
    const m = new Map<string, Price>();
    (pricesQuery.data ?? []).forEach((p) => m.set(p.device_id, p));
    return m;
  }, [pricesQuery.data]);

  const allDevices = devicesQuery.data ?? [];
  const priceFor = (d: Device): number => {
    const live = priceMap.get(d.id)?.price_cents;
    if (live != null) return live;
    if (d.price_range_low_cents != null) return d.price_range_low_cents;
    if (d.price_range_high_cents != null) return d.price_range_high_cents;
    return Number.POSITIVE_INFINITY;
  };
  const byPrice = (a: Device, b: Device) => priceFor(a) - priceFor(b);
  const androidNonFire = allDevices.filter((d) => !isFireDevice(d));
  const boxes = androidNonFire.filter((d) => !isStick(d));
  const boxHigh = boxes.filter((d) => d.tier === "high").sort(byPrice);
  const boxMedium = boxes.filter((d) => d.tier === "medium").sort(byPrice);
  const boxLow = boxes.filter((d) => d.tier === "low").sort(byPrice);
  const androidSticks = androidNonFire.filter(isStick);
  const stickHigh = androidSticks.filter((d) => d.tier === "high").sort(byPrice);
  const stickMedium = androidSticks.filter((d) => d.tier === "medium").sort(byPrice);
  const stickLow = androidSticks.filter((d) => d.tier === "low").sort(byPrice);
  const fireSticks = [...allDevices.filter(isFireDevice)].sort(byPrice);

  return (
    <div
      className="relative flex-1 overflow-y-auto bg-cover bg-center bg-no-repeat bg-fixed"
      style={{ backgroundImage: `url(${tvLoginIllustration})` }}
    >
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-background/35" />
      <div className="relative w-full px-4 sm:px-6 lg:px-8 py-6 space-y-8">
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
                <div className="space-y-0.5">
                  <h2 className="text-xl font-semibold">Low spec</h2>
                  <p className="text-xs text-muted-foreground">Budget picks that still stream well</p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {boxLow.map(renderCard)}
                </div>
              </section>
            )}

            {boxMedium.length > 0 && (
              <section className="space-y-4">
                <div className="space-y-0.5">
                  <h2 className="text-xl font-semibold">Medium spec</h2>
                  <p className="text-xs text-muted-foreground">Great value, solid for most users</p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {boxMedium.map(renderCard)}
                </div>
              </section>
            )}

            {boxHigh.length > 0 && (
              <section className="space-y-4">
                <div className="space-y-0.5">
                  <h2 className="text-xl font-semibold">High spec</h2>
                  <p className="text-xs text-muted-foreground">Best performance, top-end hardware</p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {boxHigh.map(renderCard)}
                </div>
              </section>
            )}

          </TabsContent>

          <TabsContent value="android-sticks" className="space-y-8">
            {stickLow.length > 0 && (
              <section className="space-y-4">
                <div className="space-y-0.5">
                  <h2 className="text-xl font-semibold">Low spec</h2>
                  <p className="text-xs text-muted-foreground">Budget dongles that still stream well</p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {stickLow.map(renderCard)}
                </div>
              </section>
            )}
            {stickMedium.length > 0 && (
              <section className="space-y-4">
                <div className="space-y-0.5">
                  <h2 className="text-xl font-semibold">Medium spec</h2>
                  <p className="text-xs text-muted-foreground">Reliable 4K HDR sticks for most users</p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {stickMedium.map(renderCard)}
                </div>
              </section>
            )}
            {stickHigh.length > 0 && (
              <section className="space-y-4">
                <div className="space-y-0.5">
                  <h2 className="text-xl font-semibold">High spec</h2>
                  <p className="text-xs text-muted-foreground">Top-tier dongles for serious streaming</p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {stickHigh.map(renderCard)}
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
                {fireSticks.map(renderCard)}
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