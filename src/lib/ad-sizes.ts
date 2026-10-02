/**
 * BM Support's own advert sizes. Every advert slot on the site is one of
 * these two sizes, and each uploaded banner is tagged with the size it was
 * designed for so slots only rotate banners that fit.
 */
export type AdSize = "leaderboard" | "skyscraper" | "square";

export const AD_SIZES: Record<
  AdSize,
  { label: string; width: number; height: number; recommended: string; description: string }
> = {
  leaderboard: {
    label: "Leaderboard (wide)",
    width: 900,
    height: 450,
    recommended: "2:1 — 900×450 px (design at 1800×900 for sharp screens)",
    description: "Wide banner shown across the top or middle of pages.",
  },
  skyscraper: {
    label: "Skyscraper (tall)",
    width: 300,
    height: 600,
    recommended: "300×600 px (design at 600×1200 for sharp screens)",
    description: "Tall banner shown in page sidebars.",
  },
  square: {
    label: "Square (1:1)",
    width: 300,
    height: 300,
    recommended: "1:1 — 300×300 px (design at 600×600 for sharp screens)",
    description: "Square banner shown in the home page side column, under Working Status.",
  },
};

export const AD_SIZE_KEYS = Object.keys(AD_SIZES) as AdSize[];

/** Reserved banner name for the per-size "Advertise here" placeholder artwork. */
export const ADVERTISE_HERE_NAME = "__advertise_here__";
