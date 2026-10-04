// ============= Full file contents =============

import { useEffect, useState } from "react";
import { Clock, Video } from "lucide-react";
import QRCode from "react-qr-code";
import { supabase } from "@/integrations/supabase/client";
import { nextOpeningLabel } from "@/lib/business-hours";
import { bankHolidayName, fetchUkBankHolidays } from "@/lib/uk-bank-holidays";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const WHATSAPP_NUMBER = "447477204735";

const HELP_MESSAGE =
  "Hi BM Support, I need help with my install — can we do a video call?";

/** "Video call us on WhatsApp" button that sits under the install guide info on
 *  the secure order page. Pressing it opens a pop-up box with the QR code the
 *  customer scans with their phone camera (the customer is usually on a TV or
 *  Fire Stick and can't tap links). Only usable during admin opening hours. */
export function WhatsAppVideoCall() {
  const [open, setOpen] = useState<boolean | null>(null);
  const [reopen, setReopen] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

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
    <>
      <Button
        type="button"
        variant={open ? "default" : "outline"}
        className="w-full"
        onClick={() => setDialogOpen(true)}
      >
        {open ? <Video className="size-4" /> : <Clock className="size-4" />} Video call us on WhatsApp
      </Button>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Video call us on WhatsApp</DialogTitle>
          </DialogHeader>
          {open ? (
            <div className="space-y-3 text-center">
              <p className="text-sm font-semibold">Scan with your phone camera</p>
              <div className="mx-auto w-fit rounded-lg bg-white p-2">
                <QRCode value={href} size={180} />
              </div>
              <p className="text-xs text-muted-foreground">
                It opens a WhatsApp chat with BM Support — from there start the
                video call.
              </p>
              <Button asChild className="w-full">
                <a href={href} target="_blank" rel="noopener noreferrer">
                  <Video className="size-4" /> Open WhatsApp
                </a>
              </Button>
            </div>
          ) : (
            <div className="space-y-2 py-2 text-center">
              <Clock className="mx-auto size-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Video help is only available during opening hours.
                {reopen ? ` We're next open ${reopen}.` : ""}
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
