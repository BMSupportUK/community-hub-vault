import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * New-release watch for streaming devices.
 *
 * Brands publish each new generation on a predictable official product URL
 * (e.g. .../xiaomi-tv-stick-4k-2nd-gen/ -> .../xiaomi-tv-stick-4k-3rd-gen/).
 * Weekly we probe the next generation for every tracked device that sits on an
 * official brand domain. When a newer generation goes live we:
 *   1. copy the existing entry forward with the new name + URL + scraped specs,
 *   2. deactivate (retire) the superseded generation,
 *   3. raise a staff notification so admins can sanity-check the new card.
 */

const OFFICIAL_BRAND_DOMAINS = ["mi.com", "xiaomi.com", "mecool.com", "formuler.tv", "homatics.eu"];

const ORDINALS = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th"];

type DeviceRow = {
  id: string;
  name: string;
  brand: string | null;
  tier: string;
  sort_order: number;
  image_url: string | null;
  summary: string | null;
  sideload_notes: string | null;
  specs: Record<string, unknown>;
  amazon_url: string;
};

function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, "").toLowerCase(); }
  catch { return ""; }
}

function isOfficialBrandUrl(url: string): boolean {
  const host = hostOf(url);
  return OFFICIAL_BRAND_DOMAINS.some((d) => host === d || host.endsWith("." + d));
}

/** Current generation number for a device, from its name or its URL slug. */
function currentGeneration(name: string, url: string): number {
  const hay = `${name} ${url}`.toLowerCase();
  const ord = hay.match(/\b(\d)(?:st|nd|rd|th)[\s-]*gen/);
  if (ord?.[1]) return Number(ord[1]);
  const gen = hay.match(/\bgen[\s-]*(\d)\b/);
  if (gen?.[1]) return Number(gen[1]);
  return 1;
}

/** Candidate URLs for the next generation of the same product. */
function nextGenUrlCandidates(url: string, nextGen: number): string[] {
  const ord = ORDINALS[nextGen - 1];
  if (!ord) return [];
  const out = new Set<string>();
  const trimmed = url.replace(/\/$/, "");
  const base = trimmed.replace(/-(\d)(st|nd|rd|th)-gen$/i, "").replace(/-gen-?\d$/i, "");
  out.add(`${base}-${ord}-gen/`);
  out.add(`${base}-gen-${nextGen}/`);
  out.add(`${base}-${nextGen}nd-gen/`.replace("2nd", ord));
  return [...out];
}

function nextGenName(name: string, nextGen: number): string {
  const ord = ORDINALS[nextGen - 1] ?? `${nextGen}th`;
  if (/\(\s*\d(?:st|nd|rd|th)\s*gen\s*\)/i.test(name)) {
    return name.replace(/\(\s*\d(?:st|nd|rd|th)\s*gen\s*\)/i, `(${ord} Gen)`);
  }
  if (/\d(?:st|nd|rd|th)\s*gen/i.test(name)) {
    return name.replace(/\d(?:st|nd|rd|th)\s*gen/i, `${ord} Gen`);
  }
  return `${name} (${ord} Gen)`;
}

async function pageIsLive(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      redirect: "manual",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; BM Support release watcher)",
        "Accept-Language": "en-GB,en;q=0.9",
      },
    });
    if (res.status !== 200) return false;
    const html = await res.text();
    // Some stores answer 200 with a soft 404 page.
    if (/page\s+not\s+found|cannot be reached|404/i.test(html.slice(0, 4000))) return false;
    return true;
  } catch {
    return false;
  }
}

function textOf(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ");
}

function pick(text: string, re: RegExp): string | null {
  const m = text.match(re);
  return m?.[1]?.trim().replace(/[.,;]$/, "") || null;
}

/** Best-effort spec extraction from an official product / specs page. */
async function scrapeSpecs(url: string, fallback: Record<string, unknown>): Promise<Record<string, unknown>> {
  const specsUrl = `${url.replace(/\/$/, "")}/specs/`;
  const pages: string[] = [];
  for (const u of [specsUrl, url]) {
    try {
      const res = await fetch(u, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; BM Support release watcher)" },
      });
      if (res.ok) pages.push(textOf(await res.text()));
    } catch { /* ignore */ }
  }
  const text = pages.join(" ");
  if (!text) return fallback;

  const specs: Record<string, unknown> = { ...fallback };
  const cpu = pick(text, /CPU\s*([A-Za-z0-9 \-+.]{3,40})/i);
  const ram = pick(text, /RAM\s*(\d+\s*GB)/i);
  const storage = pick(text, /Storage\s*(\d+\s*GB)/i);
  const os = pick(text, /Operating System\s*(Google TV|Android TV[\w. ]*)/i);
  const wifi = /wi-?fi\s*7/i.test(text) ? "Wi-Fi 7 dual-band"
    : /wi-?fi\s*6/i.test(text) ? "Wi-Fi 6 dual-band"
    : pick(text, /Wi-?Fi\s*(2\.4GHz\/5GHz)/i);
  const hdrBits = [
    /dolby vision/i.test(text) ? "Dolby Vision" : null,
    /hdr10\+/i.test(text) ? "HDR10+" : /hdr10/i.test(text) ? "HDR10" : null,
  ].filter(Boolean);

  if (cpu) specs["cpu"] = cpu;
  if (ram) specs["ram"] = ram;
  if (storage) specs["storage"] = storage;
  if (os) specs["os"] = os;
  if (wifi) specs["wifi"] = wifi;
  if (hdrBits.length) specs["hdr"] = hdrBits.join(", ");
  if (/8k/i.test(text)) specs["resolution"] = "8K capable";
  return specs;
}

export async function watchForDeviceReleases(): Promise<{
  checked: number;
  added: Array<{ from: string; to: string; url: string }>;
  retired: string[];
}> {
  const { data, error } = await supabaseAdmin
    .from("streaming_devices")
    .select("id, name, brand, tier, sort_order, image_url, summary, sideload_notes, specs, amazon_url")
    .eq("is_active", true);
  if (error) throw new Error(error.message);

  const devices = (data ?? []) as unknown as DeviceRow[];
  const existingNames = new Set(devices.map((d) => d.name.toLowerCase()));
  const added: Array<{ from: string; to: string; url: string }> = [];
  const retired: string[] = [];
  let checked = 0;

  for (const d of devices) {
    if (!isOfficialBrandUrl(d.amazon_url)) continue;
    checked++;

    const gen = currentGeneration(d.name, d.amazon_url);
    const nextGen = gen + 1;
    const newName = nextGenName(d.name, nextGen);
    if (existingNames.has(newName.toLowerCase())) continue;

    let liveUrl: string | null = null;
    for (const candidate of nextGenUrlCandidates(d.amazon_url, nextGen)) {
      if (await pageIsLive(candidate)) { liveUrl = candidate; break; }
      await new Promise((r) => setTimeout(r, 800));
    }
    if (!liveUrl) continue;

    const specs = await scrapeSpecs(liveUrl, d.specs ?? {});
    const { data: inserted, error: insErr } = await supabaseAdmin
      .from("streaming_devices")
      .insert({
        name: newName,
        brand: d.brand,
        tier: d.tier,
        sort_order: d.sort_order,
        image_url: d.image_url,
        summary: d.summary,
        sideload_notes: d.sideload_notes,
        specs: specs as never,
        amazon_url: liveUrl,
        is_active: true,
      })
      .select("id")
      .single();
    if (insErr) continue;

    await supabaseAdmin.from("streaming_devices").update({ is_active: false }).eq("id", d.id);
    added.push({ from: d.name, to: newName, url: liveUrl });
    retired.push(d.name);
    existingNames.add(newName.toLowerCase());

    await supabaseAdmin.from("staff_notifications").insert({
      kind: "device_new_release",
      title: `New release detected: ${newName}`,
      body: `${d.name} has been retired and replaced by ${newName}. Check the cover photo and specs on the streaming devices page.`,
      link_path: "/streaming-devices",
      entity_id: inserted?.id ?? null,
    });
  }

  return { checked, added, retired };
}
