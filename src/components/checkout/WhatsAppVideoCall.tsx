// ============= Full file contents =============

import { useEffect, useState } from "react";
import { Video, Clock } from "lucide-react";
import QRCode from "react-qr-code";
import { supabase } from "@/integrations/supabase/client";
import { nextOpeningLabel } from "@/lib/business-hours";
import { bankHolidayName, fetchUkBankHolidays } from "@/lib/uk-bank-holidays";

const WHATSAPP_NUMBER = "447477204735";

const HELP_MESSAGE =
  "Hi BM Support, I need help with my install — can we do a video call?";

/** Floating "Video call us on WhatsApp" widget, only usable during the admin-set opening hours.
 *  Shows a QR code the customer scans with their phone camera to open a chat with BM Support. */
export function WhatsAppVideoCall() {
  const [open, setOpen] = useState<boolean | null>(null);
  const [reopen, setReopen] = useState<string | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [showQr, setShowQr] = useState(true);

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

  const href = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(HELP_MESSAGE)}`;

  return (
    <div className="fixed bottom-4 left-4 z-40 max-w-[calc(100vw-2rem)]">
      {open ? (
        <div className="flex flex-col items-start gap-2">
          {showQr && (
            <div className="rounded-xl border border-border bg-card p-4 text-center shadow-xl">
              <p className="mb-2 text-sm font-semibold text-card-foreground">
                Scan with your phone camera
              </p>
              <div className="mx-auto w-fit rounded-lg bg-white p-2">
                <QRCode value={href} size={160} />
              </div>
              <p className="mt-2 max-w-[220px] text-xs text-muted-foreground">
                It opens a WhatsApp chat with BM Support — from there start the
                video call.
              </p>
            </div>
          )}
          <div className="flex items-center gap-2">
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-lg hover:opacity-90"
            >
              <Video className="h-4 w-4" /> Video call us on WhatsApp
            </a>
            {showQr ? (
              <button
                type="button"
                aria-label="Hide QR code"
                onClick={() => setShowQr(false)}
                className="rounded-full border border-border bg-background px-3 py-3 text-xs font-semibold text-muted-foreground shadow-lg hover:opacity-90"
              >
                Hide code
              </button>
            ) : (
              <button
                type="button"
                aria-label="Show QR code to scan"
                onClick={() => setShowQr(true)}
                className="rounded-full border border-primary bg-background px-3 py-3 text-xs font-semibold text-primary shadow-lg hover:opacity-90"
              >
                Show scan code
              </button>
            )}
          </div>
        </div>
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
