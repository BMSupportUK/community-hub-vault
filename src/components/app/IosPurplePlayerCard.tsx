import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Apple, ExternalLink, Eye, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** Apple App Store listing for Purple Player Lite — the iOS card links here. */
export const IOS_PURPLE_STORE_URL = "https://apps.apple.com/gb/app/purple-lite-iptv-player/id6749171817";

/** iOS setup: compact download card that opens App Store information in a dialog. */
export function IosPurpleCard() {
  const [open, setOpen] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    QRCode.toDataURL(IOS_PURPLE_STORE_URL, {
      width: 192,
      margin: 2,
      color: { dark: "#0b0616", light: "#ffffff" },
    })
      .then((url) => {
        if (!cancel) setQrDataUrl(url);
      })
      .catch(() => {});
    return () => {
      cancel = true;
    };
  }, []);

  return (
    <>
      <article className="w-full max-w-sm rounded-lg border border-border bg-surface/90 p-5 shadow-sm backdrop-blur">
        <div className="mb-4 flex items-center gap-3">
          <Apple className="size-9 shrink-0 text-primary" />
          <div>
            <h2 className="font-display text-xl font-bold">iOS Purple Player</h2>
            <p className="text-sm text-muted-foreground">iPhone &amp; iPad</p>
          </div>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          Purple Player Lite from the Apple App Store.
        </p>
        <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
          <Eye className="size-4" /> View download options
        </Button>
        <p className="mt-3 text-xs text-muted-foreground">Scan the QR code with your iPhone camera to install.</p>
      </article>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-sm overflow-x-hidden overflow-y-auto border-border bg-surface p-4 sm:max-w-md sm:p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-display text-base">
              <Apple className="size-4 text-primary" /> iOS Purple Player
            </DialogTitle>
            <DialogDescription>Scan with your iPhone camera to open Purple Player Lite in the Apple App Store.</DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-border bg-background p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">App Information</p>
            <p className="mt-1.5 text-xs text-foreground">Login Code is Added.</p>
          </div>
          <div className="flex justify-center">
            {qrDataUrl ? (
              <img src={qrDataUrl} alt="Apple App Store QR code for Purple Player Lite" className="block size-48 rounded-lg" />
            ) : (
              <div className="grid size-48 place-items-center bg-muted"><Loader2 className="size-5 animate-spin text-primary" /></div>
            )}
          </div>
          <Button asChild className="bg-gradient-primary text-primary-foreground shadow-glow hover:opacity-90">
            <a href={IOS_PURPLE_STORE_URL} target="_blank" rel="noreferrer">
              <ExternalLink className="mr-1 size-3.5 shrink-0" /> View in the App Store
            </a>
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
