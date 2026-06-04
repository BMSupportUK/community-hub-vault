import { supabaseAdmin } from "@/integrations/supabase/client.server";

type DeviceRow = { id: string; amazon_url: string; name: string };

type ScrapeResult = {
  price_cents: number | null;
  currency: string;
  availability: string | null;
  source_url: string;
};

async function firecrawlScrape(url: string): Promise<ScrapeResult> {
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
            "Extract the current product price in British Pounds (GBP, £) from this Amazon UK page. Return the price as a number (e.g. 49.99), the currency code as 'GBP', and a short availability string (e.g. 'In stock'). ONLY return a price if it is shown in GBP/£. If the price is in any other currency (USD/$, EUR/€, etc.) or unavailable, return null for price and currency.",
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
  const json = body.data?.json ?? body.json ?? {};
  const rawCurrency = (json.currency || "").toUpperCase();
  // Reject anything that isn't GBP — we only want UK prices.
  const isGbp = rawCurrency === "GBP" || rawCurrency === "£" || rawCurrency === "";
  const price =
    isGbp && typeof json.price === "number" && json.price > 0 ? json.price : null;
  return {
    price_cents: price ? Math.round(price * 100) : null,
    currency: "GBP",
    availability: json.availability ?? null,
    source_url: url,
  };
}

export async function refreshAllStreamingPrices(): Promise<{
  updated: number;
  failed: number;
  details: Array<{ name: string; ok: boolean; error?: string; price_cents?: number | null }>;
}> {
  const { data: devices, error } = await supabaseAdmin
    .from("streaming_devices")
    .select("id, amazon_url, name")
    .eq("is_active", true);
  if (error) throw new Error(error.message);

  let updated = 0;
  let failed = 0;
  const details: Array<{ name: string; ok: boolean; error?: string; price_cents?: number | null }> = [];

  for (const d of (devices ?? []) as DeviceRow[]) {
    try {
      const r = await firecrawlScrape(d.amazon_url);
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