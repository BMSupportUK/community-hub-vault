import { memo, useEffect } from "react";
import { useAuth, type AppRole } from "@/hooks/use-auth";
import {
  ADSENSE_CLIENT_ID,
  ADSENSE_ENABLED,
  ADSENSE_TOPIC_SLOT,
  ensureAdSenseScript,
  pushAd,
} from "@/lib/adsense";

const STAFF_ROLES: AppRole[] = ["admin", "management", "moderator", "staff"];

function Placeholder({ label }: { label: string }) {
  return (
    <div
      className="rounded-2xl border border-dashed border-border/70 bg-surface-2/30 px-4 py-6 text-center"
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
 * - Staff roles always see the placeholder (keeps moderation views clean and avoids invalid clicks).
 * - Everyone else gets the live ad unit once AdSense is enabled.
 */
function AdSenseSlotComponent() {
  const { hasAny } = useAuth();
  const isStaff = hasAny(STAFF_ROLES);

  useEffect(() => {
    if (isStaff || !ADSENSE_ENABLED) return;
    ensureAdSenseScript();
    // Defer the push so the <ins> element is in the DOM first.
    const id = window.setTimeout(pushAd, 50);
    return () => window.clearTimeout(id);
  }, [isStaff]);

  if (isStaff) {
    return <Placeholder label="Ad slot — hidden for staff" />;
  }

  if (!ADSENSE_ENABLED) {
    return <Placeholder label="Sponsored content appears here" />;
  }

  return (
    <div className="rounded-2xl border border-border/60 bg-surface-2/20 px-2 py-2 overflow-hidden">
      <div className="px-2 pb-1 text-[10px] uppercase tracking-[0.25em] text-muted-foreground/70">
        Advertisement
      </div>
      <ins
        className="adsbygoogle"
        style={{ display: "block", textAlign: "center" }}
        data-ad-client={ADSENSE_CLIENT_ID}
        data-ad-slot={ADSENSE_TOPIC_SLOT}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </div>
  );
}

export const AdSenseSlot = memo(AdSenseSlotComponent);
export default AdSenseSlot;
