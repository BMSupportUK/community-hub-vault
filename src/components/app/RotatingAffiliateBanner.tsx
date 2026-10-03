import { memo, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ADVERTISE_HERE_NAME } from "@/lib/ad-sizes";
import advertiseLeaderboard from "@/assets/advertise-leaderboard.png";
import advertiseSkyscraper from "@/assets/advertise-skyscraper.png";
import { AD_SIZES, type AdSize } from "@/lib/ad-sizes";
import type { AdSite } from "@/lib/ad-zones";

type Banner = {
  id: string;
  name: string;
  image_url: string;
  link_url: string | null;
  alt_text: string | null;
  size: AdSize;
  site?: AdSite;
  zones?: string[] | null;
};

type Fallback = {
  image_url?: string | null;
  link_url?: string | null;
  alt_text?: string | null;
};

const bannerCache = new Map<string, Banner[]>();

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Rotates evenly through every banner in the affiliate_banners table that
 * matches the requested `size`. Every slot opens with the "Advertise here"
 * banner, then cycles through the shuffled saved banners every `intervalMs` ms.
 */
function RotatingAffiliateBannerComponent({
  fallback,
  boardId,
  size = "skyscraper",
  intervalMs = 30000,
  paused = false,
  site,
  zone,
}: {
  site?: AdSite;
  zone?: string | null;
  fallback?: Fallback;
  boardId?: string | null;
  size?: AdSize;
  intervalMs?: number;
  paused?: boolean;
}) {
  const [banners, setBanners] = useState<Banner[] | null>(null);
  const [index, setIndex] = useState(0);
  const [fading, setFading] = useState(false);
  const [placeholderUrl, setPlaceholderUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void supabase
      .from("affiliate_banners")
      .select("image_url")
      .eq("name", ADVERTISE_HERE_NAME)
      .eq("size", size)
      .order("created_at", { ascending: false })
      .limit(1)
      .then(({ data }) => { if (!cancelled) setPlaceholderUrl(data?.[0]?.image_url ?? null); });
    return () => { cancelled = true; };
  }, [size]);

  useEffect(() => {
    let cancelled = false;
    const cacheKey = `${boardId ?? "__all__"}:${size}:${site ?? "*"}:${zone ?? "*"}`;
    const cached = bannerCache.get(cacheKey);
    if (cached) {
      setBanners(cached);
      return () => {
        cancelled = true;
      };
    }

    const load = async () => {
      let list: Banner[] = [];
      if (boardId) {
        const { data } = await supabase
          .from("forum_board_affiliate_banners")
          .select("affiliate_banners(id, name, image_url, link_url, alt_text, size, site, zones)")
          .eq("board_id", boardId);
        list = (data ?? [])
          .map((r: any) => r.affiliate_banners)
          .filter((b: any) => b && b.name !== ADVERTISE_HERE_NAME) as Banner[];
      }
      if (list.length === 0) {
        const { data } = await supabase
          .from("affiliate_banners")
          .select("id, name, image_url, link_url, alt_text, size, site, zones");
        list = ((data ?? []) as Banner[]).filter((b) => {
          if (b.name === ADVERTISE_HERE_NAME) return false;
          if (site && (b.site ?? "bm_support") !== site) return false;
          if (site === "bm_support" && b.zones && b.zones.length > 0) return !!zone && b.zones.includes(zone);
          return true;
        });
      }
      // Only rotate banners designed for this slot's size — never fall back
      // to other shapes. With none, the slot shows just "Advertise here".
      list = list.filter((b) => (b.size ?? "skyscraper") === size);
      if (cancelled) return;
      const shuffled = shuffle(list);
      bannerCache.set(cacheKey, shuffled);
      setBanners(shuffled);
    };

    const loadId = window.setTimeout(() => void load(), 250);
    return () => {
      cancelled = true;
      window.clearTimeout(loadId);
    };
  }, [boardId, size, site, zone]);

  const list = useMemo<Banner[]>(() => {
    const advertiseHere: Banner = {
      id: "__fallback__",
      name: "Advertise here",
      image_url: fallback?.image_url || placeholderUrl || (size === "leaderboard" ? advertiseLeaderboard : advertiseSkyscraper),
      link_url: fallback?.link_url || "mailto:bmsupport2022@protonmail.com",
      alt_text: fallback?.alt_text || "Advertise here",
      size,
    };
    return banners && banners.length > 0 ? [advertiseHere, ...banners] : [advertiseHere];
  }, [banners, placeholderUrl, fallback?.image_url, fallback?.link_url, fallback?.alt_text, size]);

  useEffect(() => {
    if (paused || list.length <= 1) return;
    let timeoutId: number | null = null;
    const id = setInterval(() => {
      setFading(true);
      timeoutId = window.setTimeout(() => {
        setIndex((i) => (i + 1) % list.length);
        setFading(false);
      }, 350);
    }, intervalMs);
    return () => {
      clearInterval(id);
      if (timeoutId !== null) window.clearTimeout(timeoutId);
    };
  }, [paused, list.length, intervalMs]);

  const current = list[Math.min(index, list.length - 1)];
  const spec = AD_SIZES[size];
  const isWide = size === "leaderboard";

  return (
    <div className="grid w-full min-w-0 place-items-center px-3">
      <a
        href={current.link_url || "mailto:bmsupport2022@protonmail.com"}
        target="_blank"
        rel="noopener noreferrer sponsored"
        className={`block w-full mx-auto rounded-xl border border-border bg-surface-1/85 overflow-hidden hover:border-[#E11B22]/70 hover:shadow-[0_8px_30px_-12px_rgba(225,27,34,0.55)] transition-all ${isWide ? "max-w-4xl" : size === "square" ? "max-w-[300px]" : "max-w-64"}`}
        aria-label={current.alt_text || current.name || "Sponsor"}
      >
        <img
          key={current.id}
          src={current.image_url}
          alt={current.alt_text || current.name || "Sponsor"}
          width={spec.width}
          height={spec.height}
          className={`block w-full transition-opacity duration-300 ${isWide ? "aspect-[3/1] object-contain" : size === "square" ? "aspect-square object-cover" : "h-auto object-contain"} object-center ${fading ? "opacity-0" : "opacity-100"}`}
          loading="lazy"
          decoding="async"
          fetchPriority="low"
          sizes={isWide ? "(max-width: 768px) 100vw, 900px" : "(max-width: 768px) 200px, 300px"}
        />
      </a>
    </div>
  );
}

export const RotatingAffiliateBanner = memo(RotatingAffiliateBannerComponent);

export default RotatingAffiliateBanner;
