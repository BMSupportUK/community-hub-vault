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
  highPrice?: unknown;
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
    for (const key of ["price", "lowPrice", "highPrice"] as const) {
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

function fromHtml(html: string): PriceScrape | null {
  let priceCents: number | null = null;
  let currency: string | null = null;
  let availability: string | null = null;

  const setPrice = (raw: string) => {
    if (priceCents === null) priceCents = parsePriceToCents(raw);
  };

  // Amazon-style embedded JSON.
  const priceAmount = html.match(/"priceAmount"\s*:\s*([\d.]+)/);
  if (priceAmount) {
    priceCents = parsePriceToCents(priceAmount[1]);
    const cur = html.match(/"currencySymbol"[^}]*"currency"\s*:\s*"([A-Z]{3})"/);
    if (cur) currency = cur[1];
  }

  // OpenCart shops (world-of-satellite): live price + Ex Tax. The
  // "Availability: In Stock" list item disappears on out-of-stock pages, and
  // only out-of-stock pages get the "outofstock" button class.
  const live = html.match(/class=["']live-price["'][^>]*>([^<]+)</i);
  if (live) setPrice(live[1]);
  const availLabel = html.match(/Availability\s*:\s*([^<]+)</i);
  if (availLabel) {
    availability = /out/i.test(availLabel[1]) ? "Out of stock" : /in stock/i.test(availLabel[1]) ? "In stock" : null;
  }

  // OpenCart category fallback: discounted price span.
  const priceNew = html.match(/class=["']price-new["'][^>]*>([^<]+)</i);
  if (priceNew) setPrice(priceNew[1]);
  const metaPrice =
    html.match(/itemprop=["']price["'][^>]*content=["']([^"']+)["']/i) ??
    html.match(/property=["'](?:product|og):price:amount["'][^>]*content=["']([^"']+)["']/i);
  if (metaPrice) setPrice(metaPrice[1]);
  const metaCur = html.match(/property=["'](?:product|og):price:currency["'][^>]*content=["']([A-Za-z]{3})["']/i);
  if (metaCur) currency = currency ?? metaCur[1].toUpperCase();

  if (!availability) {
    if (/out\s*of\s*stock/i.test(html)) availability = "Out of stock";
    else if (/in\s*stock/i.test(html)) availability = "In stock";
  }
  if (priceCents === null && !availability) return null;
  return { priceCents, currency, availability };
}

export async function scrapeDevicePrice(url: string): Promise<PriceScrape | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml", "Accept-Language": "en-GB,en;q=0.9" },
      signal: AbortSignal.timeout(15000),
      redirect: "follow",
    });
    if (!res.ok) return null;
    const html = await res.text();
    if (
      html.length < 15000 ||
      /Robot Check|validateCaptcha|Type the characters you see in this image|api-services-support@amazon\.com|To discuss automated access to Amazon data/i.test(
        html,
      )
    ) {
      return null;
    }
    return fromJsonLd(html) ?? fromHtml(html);
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

export type CompareOffer = { shop: string; url: string; priceCents: number; inStock: boolean };

/** Parse a PriceSpy product page's offer list (already sorted cheapest first). */
export function parsePriceSpyOffers(html: string): CompareOffer[] {
  const offers: CompareOffer[] = [];
  for (const block of html.split('data-test="OfferListItem"').slice(1)) {
    const b = block.slice(0, 9000);
    const url = b.match(/href="(https:\/\/pricespy\.co\.uk\/go-to-shop\/[^"]+)"/)?.[1];
    const shop = b.match(/alt="([^"]+)"/)?.[1];
    const text = b.replace(/<[^>]+>/g, "|");
    const price = text.match(/£\s?(\d[\d,]*(?:\.\d{2})?)/)?.[1];
    if (!url || !shop || !price) continue;
    offers.push({
      shop: shop.replace(/&amp;/g, "&"),
      url: url.replace(/&amp;/g, "&"),
      priceCents: Math.round(Number(price.replace(/,/g, "")) * 100),
      inStock: /\|\s*In stock\s*\|/i.test(text),
    });
  }
  return offers;
}

/** Cheapest in-stock offer; a brand store with a known stored price competes too. */
export function pickCheapest(
  offers: CompareOffer[],
  brandStore: { url: string; priceCents: number | null } | null,
): CompareOffer | null {
  const pool = offers.filter((o) => o.inStock);
  if (brandStore?.priceCents) pool.push({ shop: "Official store", url: brandStore.url, priceCents: brandStore.priceCents, inStock: true });
  pool.sort((a, b) => a.priceCents - b.priceCents);
  return pool[0] ?? null;
}

async function refreshFromCompare(d: { id: string; amazon_url: string; price_compare_url: string }): Promise<boolean> {
  try {
    const res = await fetch(d.price_compare_url, {
      headers: { "User-Agent": UA, Accept: "text/html", "Accept-Language": "en-GB,en;q=0.9" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return false;
    const offers = parsePriceSpyOffers(await res.text());
    if (!offers.length) return false;
    const { data: existing } = await supabaseAdmin
      .from("streaming_device_prices")
      .select("price_cents, source_url")
      .eq("device_id", d.id)
      .maybeSingle();
    const isBrand = /(^|\.)(mi|xiaomi)\.com$/i.test(new URL(d.amazon_url).hostname.replace(/^www\./, ""));
    // Brand-store price is only trusted if it was last stored against the brand link.
    const brandPrice = isBrand && (!existing?.source_url || existing.source_url === d.amazon_url) ? existing?.price_cents ?? null : null;
    const best = pickCheapest(offers, isBrand ? { url: d.amazon_url, priceCents: brandPrice } : null);
    const now = new Date().toISOString();
    const row = best
      ? { price_cents: best.priceCents, availability: "In stock", source_url: best.url, shop_name: best.shop === "Official store" ? null : best.shop }
      : { availability: "Out of stock" };
    const { error } = await supabaseAdmin
      .from("streaming_device_prices")
      .upsert({ device_id: d.id, currency: "GBP", ...row, scraped_at: now, stock_checked_at: now }, { onConflict: "device_id" });
    return !error;
  } catch {
    return false;
  }
}

export async function refreshStreamingPrices(
  mode: "full" | "stock" = "full",
): Promise<{ checked: number; updated: number; missed: string[] }> {
  const { data: devices, error } = await supabaseAdmin
    .from("streaming_devices")
    .select("id, name, amazon_url, price_compare_url")
    .eq("is_active", true)
    .not("amazon_url", "is", null);
  if (error) throw new Error(error.message);

  const rows = (devices ?? []) as { id: string; name: string; amazon_url: string; price_compare_url: string | null }[];
  const missed: string[] = [];
  let updated = 0;

  await runChunked(rows, 6, async (d) => {
    if (d.price_compare_url) {
      // Comparison pages are only fetched on the daily run.
      if (mode === "stock") return;
      if (await refreshFromCompare({ ...d, price_compare_url: d.price_compare_url })) updated++;
      else missed.push(d.name);
      return;
    }
    // Amazon serves bot-check pages to server-side readers; scraping it is
    // unreliable and can corrupt stock state, so those rows keep their
    // stored values until a readable source URL is set.
    if (/amazon\./i.test(d.amazon_url)) {
      missed.push(d.name);
      return;
    }
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
        .select("price_cents, currency, availability")
        .eq("device_id", d.id)
        .maybeSingle();
      const priceCents = scrape.priceCents ?? existing?.price_cents ?? null;
      const currency = scrape.currency ?? existing?.currency ?? "GBP";
      const availability = scrape.availability ?? existing?.availability ?? null;
      const { error: upErr } = await supabaseAdmin.from("streaming_device_prices").upsert(
        {
          device_id: d.id,
          price_cents: priceCents,
          currency,
          availability,
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
