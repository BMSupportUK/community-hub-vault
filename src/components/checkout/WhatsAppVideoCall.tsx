import { useEffect, useState } from "react";
import { Video, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { nextOpeningLabel } from "@/lib/business-hours";
import { bankHolidayName, fetchUkBankHolidays } from "@/lib/uk-bank-holidays";

const WHATSAPP_NUMBER = "447477204735";

/** Floating "Video call us on WhatsApp" button, only usable during the admin-set opening hours. */
export function WhatsAppVideoCall() {
  const [open, setOpen] = useState<boolean | null>(null);
  const [reopen, setReopen] = useState<string | null>(null);
  const [showInfo, setShowInfo] = useState(false);

  useEffect(() => {
    let alive = true;
    const check = async () => {
      try {
        const holidays = await fetchUkBankHolidays();
        let isOpen = false;
        if (!bankHolidayName(holidays, new Date())) {
          const { data } = await supabase.rpc("is_business_open");
          isOpen = data === true;
        }
        if (!alive) return;
        setOpen(isOpen);
        if (!isOpen) setReopen(await nextOpeningLabel());
      } catch {
        if (alive) setOpen(false);
      }
    };
    check();
    const t = setInterval(check, 60_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  if (open === null) return null;

  const href = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(
    "Hi BM Support, I need help with my install — can we do a video call?",
  )}`;

  return (
    <div className="fixed bottom-4 left-4 z-40 max-w-[calc(100vw-2rem)]">
      {open ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-lg hover:opacity-90"
        >
          <Video className="h-4 w-4" /> Video call us on WhatsApp
        </a>
      ) : (
        <div className="flex flex-col items-start gap-2">
          {showInfo && (
            <div className="rounded-lg border border-border bg-card p-3 text-sm text-card-foreground shadow-lg">
              WhatsApp video help is only available during opening hours.
              {reopen ? ` We're next open ${reopen}.` : ""}
            </div>
          )}
          <button
            type="button"
            onClick={() => setShowInfo((v) => !v)}
            className="flex items-center gap-2 rounded-full bg-muted px-4 py-3 text-sm font-semibold text-muted-foreground shadow-lg"
          >
            <Clock className="h-4 w-4" /> Video help closed
          </button>
        </div>
      )}
    </div>
  );
}
