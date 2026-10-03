import { memo } from "react";
import RotatingAffiliateBanner from "@/components/app/RotatingAffiliateBanner";
import type { AdSize } from "@/lib/ad-sizes";
import { useRouterState } from "@tanstack/react-router";
import { placementForPath } from "@/lib/ad-zones";

export type AdSenseSlotKind = "topic" | "sidebar" | "home" | "homeSquare" | "homeSkyscraper" | "talk" | "welcome";

/**
 * Which banner size each slot kind shows. Sidebar slots take the tall
 * skyscraper; everything in the main content flow takes the wide leaderboard.
 */
const SLOT_SIZE: Record<AdSenseSlotKind, AdSize> = {
  sidebar: "skyscraper",
  topic: "leaderboard",
  home: "leaderboard",
  homeSquare: "square",
  homeSkyscraper: "skyscraper",
  talk: "leaderboard",
  welcome: "leaderboard",
};

/**
 * Site-wide advert slot. Third-party networks (Google AdSense, Adsterra) were
 * removed: every slot now shows BM Support's own rotating banners, managed in
 * the affiliate banners admin. Props are kept so existing call sites work.
 */
function AdSenseSlotComponent({ slot = "home" }: { slot?: AdSenseSlotKind; fitViewport?: boolean }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { site, zone } = placementForPath(pathname);
  return (
    <div className="w-full">
      <RotatingAffiliateBanner size={SLOT_SIZE[slot]} site={site} zone={zone} />
    </div>
  );
}

export const AdSenseSlot = memo(AdSenseSlotComponent);
export default AdSenseSlot;
