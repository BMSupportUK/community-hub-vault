import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Apple, ExternalLink, Eye, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** Apple App Store listing for Purple Player Lite — the iOS card links here. */
export const IOS_PURPLE_STORE_URL = "https://apps.apple.com/gb/app/purple-lite-iptv-player/id6749171817";

/** iOS setup: App Store download information in a dialog, opened from the device picker. */
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
    <article className="group flex min-w-0 flex-col overflow-hidden rounded-lg border border-border/70 bg-surface shadow-soft transition-all hover:border-violet-500/40 hover:shadow-[0_0_30px_-10px_rgba(217,70,239,0.6)] md:grid md:grid-cols-[minmax(220px,42%)_minmax(0,1fr)] xl:flex xl:h-full xl:min-h-min">
      <div className="relative aspect-[16/10] overflow-hidden bg-background md:h-full md:min-h-0 md:aspect-auto xl:h-auto xl:min-h-[120px] xl:flex-1">
        <div className="absolute inset-0 grid place-items-center p-4">
          <Apple className="size-16 text-primary" aria-hidden="true" />
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3 sm:p-4 xl:flex-none xl:overflow-visible">
        <h4 className="flex min-w-0 items-center gap-1.5 break-words font-display text-base font-semibold leading-snug text-foreground sm:text-lg">
          <Apple className="size-4 text-violet-300 shrink-0" /> iOS Purple Player
        </h4>
        <p className="text-sm text-muted-foreground">
          Purple Player Lite for iPhone and iPad.
        </p>

        <div className="mt-auto pt-3 flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setOpen(true)}
            className="flex-1 h-auto min-h-9 whitespace-normal py-2"
          >
            <Eye className="size-3.5 mr-1 shrink-0" /> <span>View download options</span>
          </Button>
        </div>
      </div>
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
