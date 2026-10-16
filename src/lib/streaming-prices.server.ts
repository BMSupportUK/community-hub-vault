import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Scrapes each active streaming device's product page and refreshes
// public.streaming_device_prices (price, currency, availability).
// Called by pg_cron:
//   - refresh-streaming-prices-daily (06:00) → full scrape, updates prices
//   - refresh-streaming-stock (every 10 min) → availability only

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

export type PriceScrape = {
  priceCents: number | null;
  currency: string | null;
  availability: string | null;
};

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
}

/** Normalises "£1,829.95" / "54,99" / "129" into minor units (pence). */
export function parsePriceToCents(raw: string): number | null {
  let s = decodeEntities(raw).replace(/[^\d.,]/g, "");
  if (!s) return null;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > -1 && lastDot > -1) {
    // The right-most separator is the decimal point.
    if (lastComma > lastDot) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  } else if (lastComma > -1) {
    const frac = s.length - lastComma - 1;
    s = frac === 2 ? s.replace(",", ".") : s.replace(/,/g, "");
  }
  const n = Number.parseFloat(s);
  if (!Number.isFinite(n) || n <= 0 || n > 100000) return null;
  return Math.round(n * 100);
}

function availabilityFromUrl(u: string | undefined): string | null {
  if (!u) return null;
  if (/InStock/i.test(u)) return "In stock";
  if (/OutOfStock/i.test(u)) return "Out of stock";
  if (/PreOrder/i.test(u)) return "Pre-order";
  if (/SoldOut|Discontinued/i.test(u)) return "Out of stock";
  return null;
}

type Offerish = {
  price?: unknown;
  lowPrice?: unknown;
  priceCurrency?: unknown;
  availability?: unknown;
};

/** Walks parsed JSON-LD for Product / Offer / AggregateOffer nodes. */
function collectOffers(node: unknown, out: Offerish[]): void {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const n of node) collectOffers(n, out);
    return;
  }
  const obj = node as Record<string, unknown>;
  const t = obj["@type"];
  const type = Array.isArray(t) ? t.join(",") : String(t ?? "");
  if (/^(Offer|AggregateOffer|OfferShippingDetails)$/i.test(type)) {
    out.push(obj as Offerish);
  }
  for (const key of ["offers", "itemOffered", "mainEntity"]) {
    if (obj[key]) collectOffers(obj[key], out);
  }
}

function fromJsonLd(html: string): PriceScrape | null {
  const blocks = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  const offers: Offerish[] = [];
  for (const b of blocks) {
    try {
      collectOffers(JSON.parse(b[1].trim()), offers);
    } catch {
      /* ignore malformed blocks */
    }
  }
  if (!offers.length) return null;
  let priceCents: number | null = null;
  let currency: string | null = null;
  let availability: string | null = null;
  for (const o of offers) {
    for (const key of ["price", "lowPrice", "highPrice"]) {
      const v = o[key];
      if (priceCents === null && (typeof v === "number" || typeof v === "string")) {
        priceCents = parsePriceToCents(String(v));
      }
    }
    if (!currency && typeof o.priceCurrency === "string") currency = o.priceCurrency.toUpperCase();
    if (!availability && typeof o.availability === "string") availability = availabilityFromUrl(o.availability);
  }
  if (priceCents === null && !availability) return null;
  return { priceCents, currency, availability };
}

function fromMeta(html: string): PriceScrape | null {
  let priceCents: number | null = null;
  let currency: string | null = null;
  const patterns = [
    /itemprop=["']price["'][^>]*content=["']([^"']+)["']/i,
    /content=["']([^"']+)["'][^>]*itemprop=["']price["']/i,
    /property=["'](?:product|og):price:amount["'][^>]*content=["']([^"']+)["']/i,
    /name=["']price["'][^>]*content=["']([^"']+)["']/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m) {
      priceCents = parsePriceToCents(m[1]);
      if (priceCents !== null) break;
    }
  }
  const cur = html.match(/property=["'](?:product|og):price:currency["'][^>]*content=["']([A-Za-z]{3})["']/i);
  if (cur) currency = cur[1].toUpperCase();
  let availability: string | null = null;
  if (/out\s*of\s*stock/i.test(html)) availability = "Out of stock";
  else if (/in\s*stock/i.test(html)) availability = "In stock";
  if (priceCents === null && !availability) return null;
  return { priceCents, currency, availability };
}

export async function scrapeDevicePrice(url: string): Promise<PriceScrape | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" },
      signal: AbortSignal.timeout(15000),
      redirect: "follow",
    });
    if (!res.ok) return null;
    const html = await res.text();
    return fromJsonLd(html) ?? fromMeta(html);
  } catch {
    return null;
  }
}

async function runChunked<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    results.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  }
  return results;
}

export async function refreshStreamingPrices(
  mode: "full" | "stock" = "full",
): Promise<{ checked: number; updated: number; missed: string[] }> {
  const { data: devices, error } = await supabaseAdmin
    .from("streaming_devices")
    .select("id, name, amazon_url")
    .eq("is_active", true)
    .not("amazon_url", "is", null);
  if (error) throw new Error(error.message);

  const rows = (devices ?? []) as { id: string; name: string; amazon_url: string }[];
  const missed: string[] = [];
  let updated = 0;

  await runChunked(rows, 6, async (d) => {
    const scrape = await scrapeDevicePrice(d.amazon_url);
    if (!scrape || (scrape.priceCents === null && !scrape.availability)) {
      missed.push(d.name);
      return;
    }
    const now = new Date().toISOString();
    if (mode === "full") {
      // Keep the previous price when the page no longer exposes one.
      const { data: existing } = await supabaseAdmin
        .from("streaming_device_prices")
        .select("price_cents, currency")
        .eq("device_id", d.id)
        .maybeSingle();
      const priceCents = scrape.priceCents ?? existing?.price_cents ?? null;
      const currency = scrape.currency ?? existing?.currency ?? "GBP";
      const { error: upErr } = await supabaseAdmin.from("streaming_device_prices").upsert(
        {
          device_id: d.id,
          price_cents: priceCents,
          currency,
          availability: scrape.availability,
          source_url: d.amazon_url,
          scraped_at: now,
          stock_checked_at: now,
        },
        { onConflict: "device_id" },
      );
      if (upErr) missed.push(d.name);
      else updated++;
    } else {
      const patch: Record<string, unknown> = { availability: scrape.availability, stock_checked_at: now };
      if (scrape.priceCents !== null) {
        patch.price_cents = scrape.priceCents;
        patch.scraped_at = now;
      }
      const { error: upErr } = await supabaseAdmin
        .from("streaming_device_prices")
        .upsert({ device_id: d.id, ...patch }, { onConflict: "device_id", ignoreDuplicates: false });
      if (upErr) missed.push(d.name);
      else updated++;
    }
  });

  return { checked: rows.length, updated, missed };
}
