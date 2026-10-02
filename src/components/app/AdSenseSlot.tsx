import { memo } from "react";
import RotatingAffiliateBanner from "@/components/app/RotatingAffiliateBanner";

export type AdSenseSlotKind = "topic" | "sidebar" | "home" | "talk" | "welcome";

/**
 * Site-wide advert slot. Third-party networks (Google AdSense, Adsterra) were
 * removed: every slot now shows BM Support's own rotating banners, managed in
 * the affiliate banners admin. Props are kept so existing call sites work.
 */
function AdSenseSlotComponent(_props: { slot?: AdSenseSlotKind; fitViewport?: boolean }) {
  return (
    <div className="w-full">
      <RotatingAffiliateBanner />
    </div>
  );
}

export const AdSenseSlot = memo(AdSenseSlotComponent);
export default AdSenseSlot;
