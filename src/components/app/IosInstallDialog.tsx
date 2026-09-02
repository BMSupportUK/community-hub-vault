import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Apple, Share2, PlusSquare, Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const SITE_URL = "https://bmsupport.uk";

export function IosInstallDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [qr, setQr] = useState<string | null>(null);
  const [installed, setInstalled] = useState(false);
  const [onIphone, setOnIphone] = useState(false);

  useEffect(() => {
    if (!open) return;
    QRCode.toDataURL(SITE_URL, { width: 400, margin: 1 })
      .then(setQr)
      .catch(() => setQr(null));
  }, [open]);

  useEffect(() => {
    if (typeof navigator === "undefined") return;
    setOnIphone(/iPhone|iPad|iPod/i.test(navigator.userAgent));
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true;
    if (standalone) setInstalled(true);
  }, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xs sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Apple className="size-4 text-primary" /> Get the iPhone app
          </DialogTitle>
          <DialogDescription>
            Add BM Support to your Home Screen — full-screen app, own icon, and it stays up to date
            automatically.
          </DialogDescription>
        </DialogHeader>

        {installed ? (
          <p className="flex items-center gap-2 text-sm text-emerald-500">
            <Check className="size-4" /> BM Support is already on your Home Screen.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {!onIphone ? (
              <div className="flex flex-col items-center gap-2">
                <div className="rounded-xl bg-white p-2">
                  {qr ? (
                    <img
                      src={qr}
                      alt="QR code to open BM Support on your iPhone"
                      className="block size-[180px]"
                    />
                  ) : (
                    <div className="size-[180px] animate-pulse rounded bg-muted" />
                  )}
                </div>
                <p className="text-xs text-muted-foreground text-center">
                  Scan with your iPhone camera to open BM Support in Safari, then follow the steps
                  below.
                </p>
              </div>
            ) : null}

            <ol className="space-y-2 text-xs text-muted-foreground">
              <li className="flex gap-2">
                <span className="font-semibold text-foreground">1.</span>
                <span>
                  Open <strong className="text-foreground">bmsupport.uk</strong> in{" "}
                  <strong className="text-foreground">Safari</strong> (Chrome on iPhone can&apos;t
                  install apps).
                </span>
              </li>
              <li className="flex gap-2">
                <span className="font-semibold text-foreground">2.</span>
                <span className="inline-flex flex-wrap items-center gap-1">
                  Tap the <Share2 className="size-3.5 text-foreground" />{" "}
                  <strong className="text-foreground">Share</strong> button at the bottom of the
                  screen.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="font-semibold text-foreground">3.</span>
                <span className="inline-flex flex-wrap items-center gap-1">
                  Choose <PlusSquare className="size-3.5 text-foreground" />{" "}
                  <strong className="text-foreground">Add to Home Screen</strong>, then tap{" "}
                  <strong className="text-foreground">Add</strong>.
                </span>
              </li>
            </ol>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
