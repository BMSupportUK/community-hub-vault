/**
 * Advert placement: which site (BM Support or Boro Fan Zone) a page belongs
 * to, and for BM Support which zone. Banners store `site` + `zones`
 * (empty zones = every BM Support zone).
 */
import type { AdSize } from "@/lib/ad-sizes";

export type AdSite = "bm_support" | "fan_zone";

export const AD_SITES: Record<AdSite, string> = {
  bm_support: "BM Support",
  fan_zone: "Boro Fan Zone",
};
export const AD_SITE_KEYS = Object.keys(AD_SITES) as AdSite[];

export const BM_ZONES = [
  { key: "home", label: "Home" },
  { key: "sports_guides", label: "Sports guides" },
  { key: "forum", label: "Forum" },
  { key: "install_guides", label: "Install guides" },
  { key: "members", label: "Members" },
  { key: "packages", label: "Packages" },
  { key: "faq", label: "FAQ" },
  { key: "about", label: "About" },
  { key: "contact", label: "Contact" },
  { key: "login", label: "Login" },
  { key: "competition_winners", label: "Competition winners" },
] as const;
export type BmZone = (typeof BM_ZONES)[number]["key"];

/** Which banner sizes each BM Support zone can show. */
export const BM_ZONE_SIZES: Record<BmZone, AdSize[]> = {
  home: ["leaderboard", "skyscraper"],
  sports_guides: ["leaderboard"],
  forum: ["leaderboard", "skyscraper"],
  install_guides: ["skyscraper"],
  members: ["skyscraper"],
  packages: ["skyscraper"],
  faq: ["skyscraper"],
  about: ["skyscraper"],
  contact: ["skyscraper"],
  login: ["skyscraper"],
  competition_winners: ["skyscraper"],
};

export function placementForPath(pathname: string): { site: AdSite; zone: BmZone | null } {
  const p = pathname.toLowerCase();
  if (/^\/(fan-zone|fanzone|boro-fantasy|admin-fan-zone)(\/|\.|$)/.test(p)) return { site: "fan_zone", zone: null };
  const first = p.split("/")[1] ?? "";
  const map: Record<string, BmZone> = {
    "": "home",
    home: "home",
    guides: "sports_guides",
    "sports-guides": "sports_guides",
    forum: "forum",
    "install-guides": "install_guides",
    members: "members",
    packages: "packages",
    faq: "faq",
    about: "about",
    contact: "contact",
    login: "login",
    "competition-winners": "competition_winners",
  };
  return { site: "bm_support", zone: map[first] ?? null };
}
