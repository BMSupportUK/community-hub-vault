import { supabaseAdmin } from "@/integrations/supabase/client.server";

type DeviceRow = { id: string; amazon_url: string; name: string; brand: string | null };

type ScrapeResult = {
  price_cents: number | null;
  currency: string;
  availability: string | null;
  source_url: string;
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
];

function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, "").toLowerCase(); }
  catch { return ""; }
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
  const price = host.endsWith("world-of-satellite.co.uk")
    ? extractWorldOfSatellitePrice(html)
    : extractFirstGbpPrice(html);
  if (price === null) return null;
  return {
    price_cents: Math.round(price * 100),
    currency: "GBP",
    availability: /out\s+of\s+stock/i.test(html) ? "Out of stock" : /in\s+stock/i.test(html) ? "In stock" : null,
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

export async function refreshAllStreamingPrices(): Promise<{
  updated: number;
  failed: number;
  details: Array<{ name: string; ok: boolean; error?: string; price_cents?: number | null }>;
}> {
  const { data: devices, error } = await supabaseAdmin
    .from("streaming_devices")
    .select("id, amazon_url, name, brand")
    .eq("is_active", true);
  if (error) throw new Error(error.message);

  let updated = 0;
  let failed = 0;
  const details: Array<{ name: string; ok: boolean; error?: string; price_cents?: number | null }> = [];

  for (const d of (devices ?? []) as DeviceRow[]) {
    try {
      const isAmazonOwn =
        (d.brand ?? "").toLowerCase() === "amazon" ||
        /fire\s*tv|fire\s*stick|firestick/i.test(d.name);
      const configuredRetailerPrice = isAmazonOwn ? null : await scrapeConfiguredRetailerPrice(d.amazon_url);
      const r = isAmazonOwn
        ? await scrapeAmazonPrice(d.amazon_url)
        : configuredRetailerPrice ?? await findBestUkPrice(d.name, d.brand, d.amazon_url);
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