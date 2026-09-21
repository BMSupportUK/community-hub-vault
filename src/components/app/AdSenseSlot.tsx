import { memo, useEffect, useRef } from "react";
import { recordAdEvent } from "@/lib/ad-metrics";
import {
  ADSENSE_CLIENT_ID,
  ADSENSE_ENABLED,
  ADSENSE_HOME_SLOT,
  ADSENSE_SIDEBAR_SLOT,
  ADSENSE_TOPIC_SLOT,
  ensureAdSenseScript,
  pushAd,
} from "@/lib/adsense";

export type AdSenseSlotKind = "topic" | "sidebar" | "home";

function Placeholder({ label }: { label: string }) {
  return (
    <div
      className="hidden md:block rounded-2xl border border-dashed border-border/70 bg-surface-2/30 px-4 py-6 text-center"
      aria-hidden
    >
      <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground/70">
        Advertisement
      </div>
      <div className="mt-1 text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

/**
 * Renders a Google AdSense display unit inside a forum thread.
 * - Before the AdSense account/slot is configured, everyone sees a subtle placeholder.
 * - Everyone (staff included) gets the live ad unit once AdSense is enabled.
 */
function AdSenseSlotComponent({ slot = "topic", fitViewport = false }: { slot?: AdSenseSlotKind; fitViewport?: boolean }) {
  const adSlotId =
    slot === "sidebar"
      ? ADSENSE_SIDEBAR_SLOT
      : slot === "home"
        ? ADSENSE_HOME_SLOT
        : ADSENSE_TOPIC_SLOT;
  const enabled = ADSENSE_ENABLED && adSlotId.length > 0;
  // fitViewport: cap a sidebar unit to the visible screen height so pages
  // locked to the viewport (sign-in / join) never clip the advert.
  const sidebarFit = slot === "sidebar" && fitViewport;

  const boxRef = useRef<HTMLDivElement | null>(null);
  const pressRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!enabled) return;
    ensureAdSenseScript();
    // Defer the push so the <ins> element is in the DOM first.
    const id = window.setTimeout(pushAd, 50);
    return () => window.clearTimeout(id);
  }, [enabled]);

  // Count a view once the unit actually scrolls into sight.
  useEffect(() => {
    if (!enabled) return;
    const el = boxRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            void recordAdEvent({ kind: "impression", slotKey: slot, adSlotId });
            obs.disconnect();
          }
        }
      },
      { threshold: 0.4 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [enabled, slot, adSlotId]);

  if (!enabled) {
    return <Placeholder label="Sponsored content appears here" />;
  }

  // Only a genuine press-and-release on the advert frame itself counts as a
  // click — not the label, the padding, or a click-drag that slid away.
  const onAdPointerDown = (e: React.PointerEvent) => {
    pressRef.current = { x: e.clientX, y: e.clientY };
  };
  const onAdPointerUp = (e: React.PointerEvent) => {
    const start = pressRef.current;
    pressRef.current = null;
    if (!start) return;
    if (Math.abs(e.clientX - start.x) > 8 || Math.abs(e.clientY - start.y) > 8) return;
    void recordAdEvent({ kind: "click", slotKey: slot, adSlotId });
  };

  return (
    <div
      ref={boxRef}
      className={`hidden md:block rounded-2xl border border-border/60 bg-surface-2/20 px-2 py-2 overflow-hidden ${slot === "home" ? "h-[92px]" : slot === "topic" ? "h-[125px]" : ""} ${sidebarFit ? "flex w-full flex-col" : ""}`}
      style={sidebarFit ? { maxHeight: "calc(100dvh - 64px)" } : undefined}
    >
      <div className="px-2 pb-1 text-[10px] uppercase tracking-[0.25em] text-muted-foreground/70">
        Advertisement
      </div>
      <div className={sidebarFit ? "min-h-0 flex-1" : undefined} onPointerDown={onAdPointerDown} onPointerUp={onAdPointerUp} onPointerCancel={() => (pressRef.current = null)}>
        <ins
          className={`adsbygoogle ${slot === "home" ? "h-[64px]" : slot === "topic" ? "h-[90px]" : ""} ${sidebarFit ? "h-[min(566px,calc(100dvh-104px))]! w-full" : ""}`}
          style={{ display: "block", textAlign: "center" }}
          data-ad-client={ADSENSE_CLIENT_ID}
          data-ad-slot={adSlotId}
          data-ad-format={slot === "home" || slot === "topic" ? "horizontal" : "auto"}
          data-full-width-responsive="true"
        />
      </div>
    </div>
  );
}

export const AdSenseSlot = memo(AdSenseSlotComponent);
export default AdSenseSlot;
