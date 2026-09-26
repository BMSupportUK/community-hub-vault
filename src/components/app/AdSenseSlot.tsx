import { memo, useEffect, useRef, useState } from "react";
import { recordAdEvent } from "@/lib/ad-metrics";
import {
  ADSENSE_CLIENT_ID,
  ADSENSE_ENABLED,
  ADSENSE_HOME_SLOT,
  ADSENSE_SIDEBAR_SLOT,
  ADSENSE_TALK_SLOT,
  ADSENSE_TOPIC_SLOT,
  ADSENSE_WELCOME_SLOT,
  ensureAdSenseScript,
  pushAd,
} from "@/lib/adsense";
import {
  ADSTERRA_ENABLED,
  ADSTERRA_SHARE,
  adsterraZoneFor,
  ensureAdsterraBanner,
  isAdsterraZoneInjected,
  type AdsterraSlotKind,
  type AdsterraZone,
} from "@/lib/adsterra";

export type AdSenseSlotKind = AdsterraSlotKind;

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

type Provider = "adsterra" | "adsense" | "none";

/**
 * Renders an advert unit inside the site's shared advert slots.
 * - Adsterra and Google AdSense run side by side: on each page load every slot
 *   flips a coin (ADSTERRA_SHARE) and is filled by either network. Slots
 *   without a matching Adsterra zone always use AdSense.
 * - Before either provider is configured, everyone sees a subtle placeholder.
 * - Everyone (staff included) gets the live ad unit once a provider is enabled.
 */
function AdSenseSlotComponent({ slot = "topic", fitViewport = false }: { slot?: AdSenseSlotKind; fitViewport?: boolean }) {
  const adSlotId =
    slot === "sidebar"
      ? ADSENSE_SIDEBAR_SLOT
      : slot === "home"
        ? ADSENSE_HOME_SLOT
        : slot === "talk"
          ? ADSENSE_TALK_SLOT
          : slot === "welcome"
            ? ADSENSE_WELCOME_SLOT
            : ADSENSE_TOPIC_SLOT;
  const adsterraZone: AdsterraZone | null = ADSTERRA_ENABLED ? adsterraZoneFor(slot) : null;
  // fitViewport: cap a sidebar unit to the visible screen height so pages
  // locked to the viewport (sign-in / join) never clip the advert.
  const sidebarFit = slot === "sidebar" && fitViewport;

  // The provider is chosen in an effect, not during render: a Math.random()
  // call during SSR render would disagree with the client render and trip
  // React's hydration check. Everyone starts on the placeholder for a frame.
  const [provider, setProvider] = useState<Provider>("none");
  const enabled = provider !== "none";
  const metricSlotId = provider === "adsterra" && adsterraZone ? adsterraZone.id : adSlotId;

  const boxRef = useRef<HTMLDivElement | null>(null);
  const insRef = useRef<HTMLModElement | null>(null);
  const adsterraMountRef = useRef<HTMLDivElement | null>(null);
  const pressRef = useRef<{ x: number; y: number } | null>(null);

  // Coin flip once per slot per page load: Adsterra and AdSense alternate.
  useEffect(() => {
    const useAdsterra = !!adsterraZone && Math.random() < ADSTERRA_SHARE;
    if (useAdsterra) {
      setProvider("adsterra");
    } else {
      setProvider(ADSENSE_ENABLED ? "adsense" : "none");
    }
  }, [adsterraZone]);

  useEffect(() => {
    if (provider === "adsterra" && adsterraZone) {
      const mount = adsterraMountRef.current;
      if (!mount) return;
      if (isAdsterraZoneInjected(adsterraZone.key)) {
        // A sibling slot on this page already loaded the same zone — don't
        // double-inject it; hand this slot to AdSense instead.
        setProvider(ADSENSE_ENABLED ? "adsense" : "none");
        return;
      }
      ensureAdsterraBanner(adsterraZone, mount);
      return;
    }
    if (provider !== "adsense") return;
    ensureAdSenseScript();
    // Defer the push so the <ins> element is in the DOM first. For viewport-fit
    // sidebars, pick the format from the real screen height right before the
    // push: AdSense injects height:auto !important once filled, so the only
    // reliable way to avoid a clipped 600px unit on short screens is to ask
    // for a shorter rectangle creative up front.
    const id = window.setTimeout(() => {
      if (sidebarFit && insRef.current) {
        insRef.current.setAttribute(
          "data-ad-format",
          window.innerHeight < 700 ? "rectangle" : "auto",
        );
      }
      pushAd();
    }, 50);
    return () => window.clearTimeout(id);
  }, [provider, adsterraZone, sidebarFit]);

  // Count a view once the unit actually scrolls into sight.
  useEffect(() => {
    if (!enabled) return;
    const el = boxRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            void recordAdEvent({ kind: "impression", slotKey: slot, adSlotId: metricSlotId });
            obs.disconnect();
          }
        }
      },
      { threshold: 0.4 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [enabled, slot, metricSlotId]);

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
    void recordAdEvent({ kind: "click", slotKey: slot, adSlotId: metricSlotId });
  };

  // Adsterra banners arrive at a fixed pixel size, so the container opens up
  // to the zone's real height; AdSense units size themselves.
  const adsterraActive = provider === "adsterra";
  const containerClass = adsterraActive && adsterraZone
    ? adsterraZone.height >= 600
      ? "min-h-[640px]"
      : adsterraZone.height >= 250
        ? "min-h-[290px]"
        : adsterraZone.height >= 90
          ? "h-[132px]"
          : "h-[100px]"
    : `${slot === "home" || slot === "welcome" ? "h-[92px]" : slot === "topic" ? "h-[125px]" : slot === "sidebar" ? "min-h-[280px]" : ""} ${slot === "talk" ? "min-h-[250px]" : ""}`;

  return (
    <div
      ref={boxRef}
      className={`hidden md:block rounded-2xl border border-border/60 bg-surface-2/20 px-2 py-2 overflow-hidden ${containerClass} ${sidebarFit ? "flex w-full flex-col" : ""}`}
    >
      <div className="px-2 pb-1 text-[10px] uppercase tracking-[0.25em] text-muted-foreground/70">
        Advertisement
      </div>
      {adsterraActive ? (
        <div
          ref={adsterraMountRef}
          className={`flex w-full flex-1 items-center justify-center ${sidebarFit ? "min-h-0" : ""}`}
          onPointerDown={onAdPointerDown}
          onPointerUp={onAdPointerUp}
          onPointerCancel={() => (pressRef.current = null)}
        />
      ) : (
        <div className={`flex w-full flex-1 items-center justify-center ${sidebarFit ? "min-h-0" : ""}`} onPointerDown={onAdPointerDown} onPointerUp={onAdPointerUp} onPointerCancel={() => (pressRef.current = null)}>
          <ins
            ref={insRef}
            className={`adsbygoogle ${slot === "home" || slot === "welcome" ? "h-[64px]" : slot === "topic" ? "h-[90px]" : ""} ${sidebarFit ? "w-full" : ""}`}
            style={{ display: "block", textAlign: "center", margin: "0 auto" }}
            data-ad-client={ADSENSE_CLIENT_ID}
            data-ad-slot={adSlotId}
            data-ad-format={slot === "home" || slot === "welcome" || slot === "topic" ? "horizontal" : slot === "talk" ? "rectangle" : "auto"}
            data-full-width-responsive="true"
          />
        </div>
      )}
    </div>
  );
}

export const AdSenseSlot = memo(AdSenseSlotComponent);
export default AdSenseSlot;
