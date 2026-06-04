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

  const query = `${brand ? brand + " " : ""}${name} price UK buy`.trim();

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
              "You are extracting a single product's current sale price from a UK retailer page. Return price as a NUMBER in GBP only (e.g. 49.99). Only return a price if the page clearly sells this exact product NEW and IN STOCK, with the price shown in British Pounds (£/GBP). If the page is a category list, review, comparison, out of stock, used/refurbished, or in any other currency, return null for price. Also return a short availability string like 'In stock' if obvious, otherwise null.",
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
      url: r.url || fallbackUrl,
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
      const r = isAmazonOwn
        ? await scrapeAmazonPrice(d.amazon_url)
        : await findBestUkPrice(d.name, d.brand, d.amazon_url);
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