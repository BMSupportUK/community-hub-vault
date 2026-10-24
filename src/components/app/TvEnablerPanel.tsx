import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Smartphone, Tv, QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const TV_ENABLER_URL = "https://bmsupport.uk/api/public/tv-enabler-apk";

/** Install Guides tab: customers request the BM TV Enabler link and scan its QR code. */
export function TvEnablerPanel() {
  const [open, setOpen] = useState(false);
  const [qr, setQr] = useState<string | null>(null);

  useEffect(() => {
    if (!open || qr) return;
    QRCode.toDataURL(TV_ENABLER_URL, { width: 400, margin: 1 }).then(setQr).catch(() => setQr(null));
  }, [open, qr]);

  return (
    <div className="max-w-3xl space-y-5">
      <div className="rounded-lg border border-border bg-surface/70 p-5 sm:p-7">
        <h2 className="flex items-center gap-2 font-display text-2xl font-bold text-foreground">
          <Tv className="size-6 text-primary" /> TV Remote Enabler
        </h2>
        <p className="mt-2 text-muted-foreground">
          A small Android phone app that switches on BM Remote Control on your Amazon Fire TV, so our staff can help you with the remote during a screen share.
        </p>
        <ol className="mt-4 list-decimal space-y-2 pl-5 text-foreground">
          <li>Press <strong>Get the app link</strong> and scan the QR code with your Android phone, then install the app.</li>
          <li>On the Fire TV, open <strong>BM Remote Helper</strong> — it shows the TV's address.</li>
          <li>Make sure the phone and TV are on the same Wi-Fi.</li>
          <li>In the phone app, type the address (or press <strong>Find my TV</strong>) and press <strong>Turn on remote control</strong>.</li>
          <li>On the TV, tick <strong>Always allow</strong> and press <strong>Allow</strong>.</li>
        </ol>
        <p className="mt-3 text-sm text-muted-foreground">Android phones only. ADB debugging must be on in the Fire TV's Developer options.</p>
        <Button className="mt-5 bg-gradient-primary text-primary-foreground shadow-glow hover:opacity-90" onClick={() => setOpen(true)}>
          <QrCode className="size-4" /> Get the app link
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xs sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Smartphone className="size-4 text-primary" /> BM TV Enabler
            </DialogTitle>
            <DialogDescription>Scan this with your Android phone's camera to download and install the app.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-3">
            {qr ? (
              <img src={qr} alt="QR code to download BM TV Enabler" width={240} height={240} className="rounded-md bg-card p-2" />
            ) : (
              <div className="size-60 animate-pulse rounded-md bg-muted" />
            )}
            <a href={TV_ENABLER_URL} className="break-all text-center text-sm text-primary underline">
              Already on your phone? Tap here to download
            </a>
            <p className="text-center text-xs text-muted-foreground">If your phone asks, allow installs from your browser.</p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
