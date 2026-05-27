import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import advertiseLeaderboard from "@/assets/advertise-leaderboard.png";

type Banner = {
  id: string;
  name: string;
  image_url: string;
  link_url: string | null;
  alt_text: string | null;
};

type Fallback = {
  image_url?: string | null;
  link_url?: string | null;
  alt_text?: string | null;
};

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Rotates evenly through every banner in the affiliate_banners table.
 * The order is shuffled per page load so impressions are spread evenly
 * across visits, and the visible banner cycles every `intervalMs` ms.
 */
export function RotatingAffiliateBanner({
  fallback,
  intervalMs = 8000,
}: {
  fallback?: Fallback;
  intervalMs?: number;
}) {
  const [banners, setBanners] = useState<Banner[] | null>(null);
  const [index, setIndex] = useState(0);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("affiliate_banners")
        .select("id, name, image_url, link_url, alt_text");
      if (cancelled) return;
      setBanners(shuffle(data ?? []));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const list = useMemo<Banner[]>(() => {
    if (banners && banners.length > 0) return banners;
    return [
      {
        id: "__fallback__",
        name: "Advertise here",
        image_url: fallback?.image_url || advertiseLeaderboard,
        link_url: fallback?.link_url || "mailto:bmsupport2022@protonmail.com",
        alt_text: fallback?.alt_text || "Advertise here",
      },
    ];
  }, [banners, fallback?.image_url, fallback?.link_url, fallback?.alt_text]);

  useEffect(() => {
    if (list.length <= 1) return;
    const id = setInterval(() => {
      setFading(true);
      setTimeout(() => {
        setIndex((i) => (i + 1) % list.length);
        setFading(false);
      }, 350);
    }, intervalMs);
    return () => clearInterval(id);
  }, [list.length, intervalMs]);

  const current = list[Math.min(index, list.length - 1)];

  return (
    <a
      href={current.link_url || "mailto:bmsupport2022@protonmail.com"}
      target="_blank"
      rel="noopener noreferrer sponsored"
      className="block w-full max-w-[256px] mx-auto rounded-xl border border-border bg-surface-1/85 overflow-hidden hover:border-[#E11B22]/70 hover:shadow-[0_8px_30px_-12px_rgba(225,27,34,0.55)] transition-all"
      aria-label={current.alt_text || current.name || "Sponsor"}
    >
      <img
        key={current.id}
        src={current.image_url}
        alt={current.alt_text || current.name || "Sponsor"}
        width={512}
        height={1536}
        className={`w-full aspect-[1/3] object-cover object-center block transition-opacity duration-300 ${fading ? "opacity-0" : "opacity-100"}`}
        loading="lazy"
      />
    </a>
  );
}

export default RotatingAffiliateBanner;