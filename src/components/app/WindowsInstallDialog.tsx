import { useEffect, useState } from "react";
import { Monitor, Download, Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let deferredPrompt: InstallPromptEvent | null = null;

/** Capture the browser install prompt as early as possible. */
export function useInstallPrompt() {
  const [available, setAvailable] = useState(() => deferredPrompt !== null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      deferredPrompt = e as InstallPromptEvent;
      setAvailable(true);
    };
    const onInstalled = () => {
      deferredPrompt = null;
      setAvailable(false);
      setInstalled(true);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    if (window.matchMedia?.("(display-mode: standalone)").matches) setInstalled(true);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = async () => {
    if (!deferredPrompt) return false;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      deferredPrompt = null;
      setAvailable(false);
      setInstalled(true);
      return true;
    }
    return false;
  };

  return { available, installed, install };
}

export function WindowsInstallDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { available, installed, install } = useInstallPrompt();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Monitor className="size-4 text-primary" /> Get the Windows app
          </DialogTitle>
          <DialogDescription>
            Install BM Support as a desktop app — its own window, taskbar icon and Start menu
            entry, and it updates itself.
          </DialogDescription>
        </DialogHeader>

        {installed ? (
          <p className="flex items-center gap-2 text-sm text-emerald-500">
            <Check className="size-4" /> BM Support is installed on this PC.
          </p>
        ) : (
          <div className="space-y-3">
            <Button
              size="sm"
              className="w-full bg-gradient-primary text-primary-foreground hover:opacity-90"
              disabled={!available}
              onClick={async () => {
                const ok = await install();
                if (ok) {
                  toast.success("BM Support installed");
                  onOpenChange(false);
                }
              }}
            >
              <Download className="size-4 mr-1.5" /> Install on this PC
            </Button>
            {!available ? (
              <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground space-y-1.5">
                <p className="font-semibold text-foreground">Install it manually</p>
                <p>
                  In Microsoft Edge or Google Chrome, open the <strong>...</strong> menu, then choose{" "}
                  <strong>Apps</strong> &rarr; <strong>Install this site as an app</strong>. You can
                  also click the install icon in the address bar.
                </p>
                <p>
                  If you already installed it, open it from the Start menu instead of this browser
                  tab.
                </p>
              </div>
            ) : null}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
