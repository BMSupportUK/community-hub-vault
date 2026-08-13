import { supabaseAdmin } from "@/integrations/supabase/client.server";

type DeviceRow = {
  id: string;
  amazon_url: string;
  price_watch_url: string | null;
  name: string;
  brand: string | null;
};

type ScrapeResult = {
  price_cents: number | null;
  currency: string;
  availability: string | null;
  source_url: string;
  delisted?: boolean;
};

type PriceHit = {
  price: number | null;
  currency: string | null;
  availability: string | null;
  url: string;
  title?: string;
};

// Domains that publish news, reviews, deals, guides or comparisons rather than
// selling the product directly. We never trust a price coming from these.
const NON_RETAILER_DOMAINS = [
  "reddit.com", "youtube.com", "youtu.be", "facebook.com", "twitter.com", "x.com",
  "instagram.com", "tiktok.com", "pinterest.com", "medium.com", "quora.com",
  "wikipedia.org", "wikia.com", "linkedin.com",
  "techradar.com", "tomsguide.com", "trustedreviews.com", "whathifi.com",
  "which.co.uk", "expertreviews.co.uk", "pocket-lint.com", "stuff.tv",
  "theverge.com", "engadget.com", "cnet.com", "wired.com", "wired.co.uk",
  "pcmag.com", "androidcentral.com", "androidauthority.com", "9to5google.com",
  "9to5mac.com", "arstechnica.com", "gizmodo.com", "lifehacker.com",
  "thesun.co.uk", "dailymail.co.uk", "mirror.co.uk", "express.co.uk",
  "telegraph.co.uk", "theguardian.com", "bbc.co.uk", "bbc.com", "metro.co.uk",
  "independent.co.uk", "standard.co.uk", "huffingtonpost.co.uk", "huffpost.com",
  "cordbusters.co.uk", "wonderprice.co.uk", "hotukdeals.com", "latestdeals.co.uk",
  "moneysavingexpert.com", "idealo.co.uk", "pricerunner.com", "kelkoo.co.uk",
  "google.com", "shopping.google.com", "bing.com",
  "trustpilot.com", "reviews.io",
];

// URL path fragments that strongly suggest a real product / buy page.
const PRODUCT_PATH_HINTS = [
  "/product/", "/products/", "/p/", "/dp/", "/shop/", "/buy/", "/item/",
  "/store/", "/sku/", "-p-", "/pd/", "/itm/",
];

const TRUSTED_RETAILER_DOMAINS = [
  "amazon.co.uk", "argos.co.uk", "currys.co.uk", "johnlewis.com", "very.co.uk",
  "ao.com", "box.co.uk", "ebuyer.com", "scan.co.uk", "overclockers.co.uk",
  "world-of-satellite.co.uk", "sat25.com", "mecool.com", "formuler.tv",
  "mi.com", "xiaomi.com",
];

function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, "").toLowerCase(); }
  catch { return ""; }
}

// Brands whose prices and buy links must ALWAYS come from their own official
// store — never Amazon, never an open web search.
const BRAND_STORE_ONLY_DOMAINS = ["mi.com", "xiaomi.com"];

export function isBrandStoreOnlyUrl(url: string): boolean {
  const host = hostOf(url);
  return BRAND_STORE_ONLY_DOMAINS.some((d) => host === d || host.endsWith("." + d));
}

/** Scrape a JS-rendered official brand store product page for its GBP price. */
/**
 * Xiaomi's product page always shows a "Buy Now" button; the real stock state
 * only appears on the store's buy page, where the CTA becomes "Notify Me" when
 * the item cannot be purchased. Returns null when the page can't be read.
 */
async function brandStoreBuyPageAvailability(url: string): Promise<string | null> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) return null;
  const m = url.match(/^(https?:\/\/[^/]+\/[a-z-]+)\/product\/([^/?#]+)/i);
  if (!m) return null;
  const buyUrl = `${m[1]}/buy/product/${m[2]}/`;
  try {
    const res = await fetch("https://api.firecrawl.dev/v2/scrape", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        url: buyUrl,
        onlyMainContent: false,
        waitFor: 6000,
        location: { country: "GB", languages: ["en-GB"] },
        formats: ["markdown"],
      }),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      data?: { markdown?: string | null; metadata?: Record<string, unknown> };
      markdown?: string | null;
      metadata?: Record<string, unknown>;
    };
    const meta = body.data?.metadata ?? body.metadata ?? {};
    const finalUrl = String(meta["url"] ?? meta["sourceURL"] ?? "");
    if (meta["statusCode"] === 404 || /errors\/404/i.test(finalUrl)) return null;
    const md = body.data?.markdown ?? body.markdown ?? "";
    if (!md) return null;
    // "Notify Me" / "Email me when available" replaces the buy CTA => sold out.
    if (/notify\s*me|email\s*me\s*when|sold\s*out|out\s*of\s*stock|coming\s*soon/i.test(md)) {
      return "Out of stock";
    }
    if (/add\s*to\s*(cart|bag|basket)|buy\s*now|checkout/i.test(md)) return "In stock";
    return null;
  } catch {
    return null;
  }
}

async function scrapeBrandStorePrice(url: string): Promise<ScrapeResult> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) throw new Error("FIRECRAWL_API_KEY not configured");

  const res = await fetch("https://api.firecrawl.dev/v2/scrape", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      url,
      onlyMainContent: false,
      waitFor: 4000,
      location: { country: "GB", languages: ["en-GB"] },
      formats: [
        "markdown",
        {
          type: "json",
          prompt:
            "This is an official brand store product page. Extract the current selling price of THIS product in GBP as a number (e.g. 49.99). Ignore accessories, bundles, crossed-out RRP and other products. Return null if no GBP price is shown. Also return availability: return exactly 'Out of stock' if the buy button is disabled or the page shows Out of stock / Sold out / Notify me / Coming soon / Temporarily unavailable / Email me when available; return exactly 'In stock' only if the product can be added to cart or bought right now; otherwise null.",
          schema: {
            type: "object",
            properties: {
              price: { type: ["number", "null"] },
              currency: { type: ["string", "null"] },
              availability: { type: ["string", "null"] },
            },
          },
        },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Firecrawl ${res.status}: ${text.slice(0, 200)}`);
  }

  const body = (await res.json()) as {
    data?: {
      json?: { price?: number | null; availability?: string | null };
      markdown?: string | null;
      metadata?: Record<string, unknown>;
    };
    json?: { price?: number | null; availability?: string | null };
    markdown?: string | null;
    metadata?: Record<string, unknown>;
  };
  const j = body.data?.json ?? body.json ?? {};
  const markdown = body.data?.markdown ?? body.markdown ?? "";
  const meta = body.data?.metadata ?? body.metadata ?? {};
  const metaBlob = JSON.stringify(meta);
  // A retired/removed product redirects to the store's 404 page. It must be
  // removed from the catalogue, not presented as an out-of-stock product.
  const isMissingPage =
    meta["statusCode"] === 404 || /errors\/404|\b404 - /i.test(metaBlob);
  if (isMissingPage) {
    return {
      price_cents: null,
      currency: "GBP",
      availability: "Delisted",
      source_url: url,
      delisted: true,
    };
  }
  const price = typeof j.price === "number" && j.price >= 5 && j.price <= 2000 ? j.price : null;
  // Deterministic override: the brand store swaps its buy button for a
  // "Notify me" / "Notify me when available" / "Sold out" call-to-action when a
  // product cannot be bought. That always means out of stock, whatever the
  // extraction says.
  const notifyOnly = /notify\s*me|email\s*me\s*when|notify\s*when\s*available|out\s*of\s*stock|sold\s*out|coming\s*soon/i.test(
    markdown ?? "",
  );
  return {
    price_cents: price !== null ? Math.round(price * 100) : null,
    currency: "GBP",
    availability: notifyOnly ? "Out of stock" : normalizeAvailability(j.availability),
    source_url: url,
  };
}

function normalizeAvailability(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (/out\s*of\s*stock|sold\s*out|notify\s*me|coming\s*soon|unavailable|back\s*in\s*stock/i.test(raw)) {
    return "Out of stock";
  }
  if (/in\s*stock|available|add\s*to\s*(cart|bag|basket)|buy\s*now/i.test(raw)) return "In stock";
  return raw;
}

function isRetailerUrl(url: string): boolean {
  const host = hostOf(url);
  if (!host) return false;
  if (NON_RETAILER_DOMAINS.some((d) => host === d || host.endsWith("." + d))) return false;
  if (TRUSTED_RETAILER_DOMAINS.some((d) => host === d || host.endsWith("." + d))) return true;
  // Reject obvious editorial sub-paths.
  const path = (() => { try { return new URL(url).pathname.toLowerCase(); } catch { return ""; } })();
  if (/\/(news|blog|article|review|reviews|guide|guides|deals|deal|best-|how-to|vs-|comparison)\b/.test(path)) return false;
  // Accept if path looks like a product page, or host is a known shop TLD pattern.
  if (PRODUCT_PATH_HINTS.some((h) => path.includes(h))) return true;
  // Common shop signals in host name.
  if (/(shop|store|buy|cart|checkout)/.test(host)) return true;
  return false;
}

async function scrapeConfiguredRetailerPrice(url: string): Promise<ScrapeResult | null> {
  const host = hostOf(url);
  if (!isRetailerUrl(url) || host === "amazon.co.uk") return null;
  const pageUrl = host === "sat25.com" && !/[?&]currency=GBP\b/i.test(url)
    ? `${url}${url.includes("?") ? "&" : "?"}currency=GBP`
    : url;
  const res = await fetch(pageUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; BM Support price checker)",
      "Accept-Language": "en-GB,en;q=0.9",
    },
  });
  if (!res.ok) return null;
  const html = await res.text();
  const isWorldOfSatellite = host.endsWith("world-of-satellite.co.uk");
  const price = isWorldOfSatellite
    ? extractWorldOfSatellitePrice(html)
    : extractFirstGbpPrice(html);
  if (price === null) return null;
  const availability = isWorldOfSatellite
    ? extractWorldOfSatelliteAvailability(html)
    : /out\s+of\s+stock/i.test(html)
      ? "Out of stock"
      : /in\s+stock/i.test(html)
        ? "In stock"
        : null;
  return {
    price_cents: Math.round(price * 100),
    currency: "GBP",
    availability,
    source_url: pageUrl,
  };
}

function extractFirstGbpPrice(html: string): number | null {
  const matches = [...html.matchAll(/£\s*([0-9]{1,4}(?:,[0-9]{3})?(?:\.[0-9]{2})?)/g)]
    .map((m) => Number(m[1].replace(/,/g, "")))
    .filter((n) => Number.isFinite(n) && n >= 5 && n <= 2000);
  return matches[0] ?? null;
}

function extractWorldOfSatellitePrice(html: string): number | null {
  const productStart = html.search(/Product Code:|Price Match|Availability:/i);
  const productEnd = html.indexOf("id=\"button-cart\"", Math.max(productStart, 0));
  const productBlock = html.slice(
    productStart >= 0 ? productStart : 0,
    productEnd > productStart ? productEnd : Math.min(html.length, (productStart >= 0 ? productStart : 0) + 5000),
  );
  const beforeTax = productBlock.split(/Ex\s+Tax:/i)[0] || productBlock;
  const prices = [...beforeTax.matchAll(/£\s*([0-9]{1,4}(?:,[0-9]{3})?(?:\.[0-9]{2})?)/g)]
    .map((m) => Number(m[1].replace(/,/g, "")))
    .filter((n) => Number.isFinite(n) && n >= 5 && n <= 2000);
  if (prices.length === 0) return null;
  return Math.min(...prices);
}

function extractWorldOfSatelliteAvailability(html: string): string | null {
  const availabilityLabel = html.search(/Availability:/i);
  if (availabilityLabel < 0) return null;
  const productAvailability = html.slice(availabilityLabel, availabilityLabel + 600);
  if (/out\s+of\s+stock|sold\s*out|pre-?order/i.test(productAvailability)) return "Out of stock";
  if (/in\s+stock|available/i.test(productAvailability)) return "In stock";
  return null;
}

// Scrape a single Amazon UK product page for the current GBP price.
async function scrapeAmazonPrice(url: string): Promise<ScrapeResult> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) throw new Error("FIRECRAWL_API_KEY not configured");

  const res = await fetch("https://api.firecrawl.dev/v2/scrape", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url,
      onlyMainContent: true,
      location: { country: "GB", languages: ["en-GB"] },
      formats: [
        {
          type: "json",
          prompt:
            "Extract the current sale price of this Amazon product in GBP as a number (e.g. 49.99). Only return a price if shown in British Pounds (£/GBP) and the item is in stock. Return null otherwise. Also return availability as a short string if obvious.",
          schema: {
            type: "object",
            properties: {
              price: { type: ["number", "null"] },
              currency: { type: ["string", "null"] },
              availability: { type: ["string", "null"] },
            },
          },
        },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Firecrawl ${res.status}: ${text.slice(0, 200)}`);
  }

  const body = (await res.json()) as {
    data?: { json?: { price?: number | null; currency?: string | null; availability?: string | null } };
    json?: { price?: number | null; currency?: string | null; availability?: string | null };
  };
  const j = body.data?.json ?? body.json ?? {};
  const price = typeof j.price === "number" && j.price > 0 ? j.price : null;
  return {
    price_cents: price !== null ? Math.round(price * 100) : null,
    currency: "GBP",
    availability: j.availability ?? null,
    source_url: url,
  };
}

// Search the open UK web for the lowest in-stock GBP price for a product.
async function findBestUkPrice(
  name: string,
  brand: string | null,
  fallbackUrl: string,
): Promise<ScrapeResult> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) throw new Error("FIRECRAWL_API_KEY not configured");

  const query = `buy ${brand ? brand + " " : ""}${name} UK in stock product page add to basket -amazon -review -news -blog -deals -guide -comparison`.trim();

  const res = await fetch("https://api.firecrawl.dev/v2/search", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query,
      limit: 6,
      lang: "en",
      country: "gb",
      scrapeOptions: {
        onlyMainContent: true,
        location: { country: "GB", languages: ["en-GB"] },
        formats: [
          {
            type: "json",
            prompt:
              "You are extracting a price from a UK RETAILER product page where a customer can ADD TO BASKET / BUY NOW the exact product right now. Return price as a NUMBER in GBP (e.g. 49.99) ONLY IF the page has a clear Add to Basket / Add to Cart / Buy Now button, the product is NEW and IN STOCK, and the price is in British Pounds (£/GBP). Return null for price if the page is a news article, blog post, review, buying guide, deals roundup, comparison, forum post, category listing, out of stock, used/refurbished, or in any other currency. Also return a short availability string like 'In stock' if obvious, otherwise null.",
            schema: {
              type: "object",
              properties: {
                price: { type: ["number", "null"] },
                currency: { type: ["string", "null"] },
                availability: { type: ["string", "null"] },
              },
            },
          },
        ],
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Firecrawl ${res.status}: ${text.slice(0, 200)}`);
  }

  const body = (await res.json()) as {
    data?: {
      web?: Array<{
        url?: string;
        title?: string;
        json?: { price?: number | null; currency?: string | null; availability?: string | null };
      }>;
    };
    web?: Array<{
      url?: string;
      title?: string;
      json?: { price?: number | null; currency?: string | null; availability?: string | null };
    }>;
  };

  const results = body.data?.web ?? body.web ?? [];
  const hits: PriceHit[] = [];
  for (const r of results) {
    const url = r.url || "";
    if (!isRetailerUrl(url)) continue;
    const j = r.json ?? {};
    const rawCurrency = (j.currency || "").toUpperCase();
    const isGbp = rawCurrency === "GBP" || rawCurrency === "£" || rawCurrency === "";
    if (!isGbp) continue;
    if (typeof j.price !== "number" || !(j.price > 0)) continue;
    // Sanity bounds: reject obvious noise (accessories, shipping fees, etc.)
    if (j.price < 5 || j.price > 2000) continue;
    hits.push({
      price: j.price,
      currency: "GBP",
      availability: j.availability ?? null,
      url: url || fallbackUrl,
      title: r.title,
    });
  }

  if (hits.length === 0) {
    return { price_cents: null, currency: "GBP", availability: null, source_url: fallbackUrl };
  }

  hits.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
  const best = hits[0];
  return {
    price_cents: Math.round((best.price ?? 0) * 100),
    currency: "GBP",
    availability: best.availability,
    source_url: best.url,
  };
}

/**
 * Stock-only check for a single product URL. Much cheaper than a full price
 * scrape, so it can run every few minutes to keep availability live.
 */
async function checkStockForUrl(url: string): Promise<{
  availability: string | null;
  delisted: boolean;
}> {
  const host = hostOf(url);

  // Official brand stores (Xiaomi) render stock state with JavaScript.
  if (isBrandStoreOnlyUrl(url)) {
    const r = await scrapeBrandStorePrice(url);
    return { availability: r.availability, delisted: Boolean(r.delisted) };
  }

  // World of Satellite (and other configured retailers) expose stock in HTML.
  if (host.endsWith("world-of-satellite.co.uk")) {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; BM Support stock checker)",
        "Accept-Language": "en-GB,en;q=0.9",
      },
    });
    if (res.status === 404) return { availability: "Delisted", delisted: true };
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    return { availability: extractWorldOfSatelliteAvailability(html), delisted: false };
  }

  // Amazon UK (Fire TV sticks) needs a rendered scrape.
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) throw new Error("FIRECRAWL_API_KEY not configured");
  const res = await fetch("https://api.firecrawl.dev/v2/scrape", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      url,
      onlyMainContent: true,
      location: { country: "GB", languages: ["en-GB"] },
      formats: [
        {
          type: "json",
          prompt:
            "Look ONLY at the buy box / availability for THIS product (ignore related products, other sellers' listings, reviews and accessories). Return availability as exactly 'In stock' if the product itself can be added to basket or bought now, exactly 'Out of stock' if it shows Currently unavailable / Out of stock / Sold out / Temporarily out of stock / pre-order only, otherwise null.",
          schema: {
            type: "object",
            properties: { availability: { type: ["string", "null"] } },
          },
        },
      ],
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Firecrawl ${res.status}: ${text.slice(0, 200)}`);
  }
  const body = (await res.json()) as {
    data?: { json?: { availability?: string | null }; metadata?: Record<string, unknown> };
    json?: { availability?: string | null };
    metadata?: Record<string, unknown>;
  };
  const meta = body.data?.metadata ?? body.metadata ?? {};
  if (meta["statusCode"] === 404) return { availability: "Delisted", delisted: true };
  const raw = (body.data?.json ?? body.json ?? {}).availability;
  return { availability: normalizeAvailability(raw), delisted: false };
}

/**
 * Refresh availability for every active device without touching stored prices.
 * Runs frequently (cron) so the store shows real-time stock status for World of
 * Satellite, Fire TV and Xiaomi products.
 */
export async function refreshAllStreamingStock(): Promise<{
  updated: number;
  failed: number;
  details: Array<{ name: string; ok: boolean; availability?: string | null; error?: string }>;
}> {
  const { data: devices, error } = await supabaseAdmin
    .from("streaming_devices")
    .select("id, amazon_url, price_watch_url, name, brand")
    .eq("is_active", true);
  if (error) throw new Error(error.message);

  let updated = 0;
  let failed = 0;
  const details: Array<{ name: string; ok: boolean; availability?: string | null; error?: string }> = [];

  for (const d of (devices ?? []) as DeviceRow[]) {
    try {
      // Xiaomi is locked to its own store; everything else prefers the watch URL.
      const url = isBrandStoreOnlyUrl(d.amazon_url)
        ? d.amazon_url
        : d.price_watch_url || d.amazon_url;
      const { availability, delisted } = await checkStockForUrl(url);

      if (delisted) {
        const { error: hideErr } = await supabaseAdmin
          .from("streaming_devices")
          .update({ is_active: false })
          .eq("id", d.id);
        if (hideErr) throw new Error(hideErr.message);
      }

      if (availability) {
        const { error: upErr } = await supabaseAdmin
          .from("streaming_device_prices")
          .update({ availability, stock_checked_at: new Date().toISOString() })
          .eq("device_id", d.id);
        if (upErr) throw new Error(upErr.message);
      }
      updated++;
      details.push({ name: d.name, ok: true, availability });
    } catch (e) {
      failed++;
      details.push({ name: d.name, ok: false, error: e instanceof Error ? e.message : String(e) });
    }
    await new Promise((r) => setTimeout(r, 800));
  }

  return { updated, failed, details };
}

export async function refreshAllStreamingPrices(): Promise<{
  updated: number;
  failed: number;
  details: Array<{ name: string; ok: boolean; error?: string; price_cents?: number | null }>;
}> {
  const { data: devices, error } = await supabaseAdmin
    .from("streaming_devices")
    .select("id, amazon_url, price_watch_url, name, brand")
    .eq("is_active", true);
  if (error) throw new Error(error.message);

  let updated = 0;
  let failed = 0;
  const details: Array<{ name: string; ok: boolean; error?: string; price_cents?: number | null }> = [];

  for (const d of (devices ?? []) as DeviceRow[]) {
    try {
      // An explicit price watch URL always wins, then the device's own listing
      // URL, then an open web search for the cheapest in-stock UK price.
      // Official brand stores (e.g. Xiaomi) are locked to their own site.
      if (isBrandStoreOnlyUrl(d.amazon_url)) {
        const r = await scrapeBrandStorePrice(d.amazon_url);
        if (r.delisted) {
          const { error: hideErr } = await supabaseAdmin
            .from("streaming_devices")
            .update({ is_active: false })
            .eq("id", d.id);
          if (hideErr) throw new Error(hideErr.message);
        }
        const { error: brandErr } = await supabaseAdmin
          .from("streaming_device_prices")
          .upsert({
            device_id: d.id,
            price_cents: r.price_cents,
            currency: r.currency,
            availability: r.availability,
            source_url: d.amazon_url,
            scraped_at: new Date().toISOString(),
          });
        if (brandErr) throw new Error(brandErr.message);
        updated++;
        details.push({ name: d.name, ok: true, price_cents: r.price_cents });
        await new Promise((r2) => setTimeout(r2, 1500));
        continue;
      }

      const watchUrl = d.price_watch_url || d.amazon_url;
      const isAmazonPage = hostOf(watchUrl).endsWith("amazon.co.uk");
      const isAmazonOwn =
        (d.brand ?? "").toLowerCase() === "amazon" ||
        /fire\s*tv|fire\s*stick|firestick/i.test(d.name);
      const r = isAmazonPage || isAmazonOwn
        ? await scrapeAmazonPrice(watchUrl)
        : (await scrapeConfiguredRetailerPrice(watchUrl))
          ?? await findBestUkPrice(d.name, d.brand, d.amazon_url);
      const { error: upErr } = await supabaseAdmin
        .from("streaming_device_prices")
        .upsert({
          device_id: d.id,
          price_cents: r.price_cents,
          currency: r.currency,
          availability: r.availability,
          source_url: r.source_url,
          scraped_at: new Date().toISOString(),
        });
      if (upErr) throw new Error(upErr.message);
      updated++;
      details.push({ name: d.name, ok: true, price_cents: r.price_cents });
    } catch (e) {
      failed++;
      details.push({ name: d.name, ok: false, error: e instanceof Error ? e.message : String(e) });
    }
    await new Promise((r) => setTimeout(r, 1500));
  }

  return { updated, failed, details };
}