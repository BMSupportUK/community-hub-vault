import { useCallback, useEffect, useRef, useState } from "react";
import type { PluginListenerHandle } from "@capacitor/core";
import { Loader2, Wifi, Tv, RefreshCw, CheckCircle2, AlertTriangle, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  LocalSend,
  deviceLabel,
  isLocalSendAvailable,
  type LocalSendDevice,
  type LocalSendProgress,
} from "@/lib/localsend";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appName: string;
  fileName: string;
  fileSize: number;
  /** Absolute URL to the member's own expiring transfer link. */
  fileUrl: string;
};

const PHASE_TEXT: Record<LocalSendProgress["phase"], string> = {
  preparing: "Preparing…",
  waiting: "Waiting for you to accept on the TV…",
  sending: "Sending…",
  done: "Sent",
};

export function LocalSendDialog({ open, onOpenChange, appName, fileName, fileSize, fileUrl }: Props) {
  const native = isLocalSendAvailable();
  const [devices, setDevices] = useState<LocalSendDevice[]>([]);
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState<LocalSendProgress | null>(null);
  const [sendingTo, setSendingTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [doneOn, setDoneOn] = useState<string | null>(null);
  const listeners = useRef<PluginListenerHandle[]>([]);

  const startScan = useCallback(async () => {
    if (!native) return;
    setError(null);
    setDevices([]);
    setScanning(true);
    try {
      await LocalSend.scan();
    } catch {
      setError("Couldn't scan the network.");
    }
    window.setTimeout(() => setScanning(false), 7000);
  }, [native]);

  useEffect(() => {
    if (!open || !native) return;
    let cancelled = false;

    (async () => {
      const d = await LocalSend.addListener("localSendDevice", (dev) => {
        if (cancelled) return;
        setDevices((prev) => (prev.some((p) => p.ip === dev.ip) ? prev : [...prev, dev]));
      });
      const p = await LocalSend.addListener("localSendProgress", (ev) => {
        if (!cancelled) setProgress(ev);
      });
      listeners.current = [d, p];
    })();

    void startScan();

    return () => {
      cancelled = true;
      const handles = listeners.current;
      listeners.current = [];
      handles.forEach((h) => {
        void h.remove();
      });
      void LocalSend.cancel().catch(() => {});
    };
  }, [open, native, startScan]);

  useEffect(() => {
    if (!open) {
      setDevices([]);
      setProgress(null);
      setSendingTo(null);
      setDoneOn(null);
      setError(null);
    }
  }, [open]);

  const onSend = async (dev: LocalSendDevice) => {
    setError(null);
    setDoneOn(null);
    setSendingTo(dev.ip);
    setProgress({ phase: "preparing", percent: 0 });
    try {
      await LocalSend.send({
        deviceIp: dev.ip,
        port: dev.port,
        protocol: dev.protocol,
        url: fileUrl,
        fileName,
        size: fileSize,
      });
      setDoneOn(deviceLabel(dev));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Wi-Fi send failed";
      setError(
        /declined|403/i.test(msg)
          ? "The TV declined the transfer — accept the prompt in LocalSend and try again."
          : /refused|connect|timed?\s?out|unreachable/i.test(msg)
            ? "Couldn't reach LocalSend on that device. Make sure LocalSend is open on the TV and both devices are on the same Wi-Fi."
            : msg,
      );
    } finally {
      setSendingTo(null);
      setProgress(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm sm:max-w-md border-violet-500/30 bg-violet-950/95">
        <DialogHeader>
          <DialogTitle className="font-display text-base flex items-center gap-2">
            <Wifi className="size-4 text-violet-300" /> Send over Wi-Fi
          </DialogTitle>
          <DialogDescription>
            {native
              ? `Push ${appName} straight to a Fire Stick or Android box running LocalSend on this Wi-Fi.`
              : "Wi-Fi sending needs the BM Support Android app."}
          </DialogDescription>
        </DialogHeader>

        {!native ? (
          <div className="rounded-lg border border-amber-400/40 bg-amber-950/30 p-3 text-xs text-amber-100 flex gap-2">
            <Smartphone className="size-4 shrink-0 mt-0.5" />
            <p>
              A web browser can't talk to devices on your local network. Open this page in the BM
              Support Android app, or use the QR code / download link to install on your TV.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-lg border border-violet-500/30 bg-violet-500/10 p-2.5 text-[11px] text-violet-100">
              On the TV: open <strong>LocalSend</strong> and leave it on the main screen. When the
              transfer starts, press <strong>Accept</strong> with your remote. Afterwards open the
              received file in LocalSend to install it.
            </div>

            {doneOn && (
              <div className="rounded-lg border border-emerald-400/40 bg-emerald-950/40 p-3 text-xs text-emerald-100 flex gap-2">
                <CheckCircle2 className="size-4 shrink-0 mt-0.5" />
                <p>
                  Sent to {doneOn}. On the TV, open LocalSend's received files and tap the APK to
                  install it.
                </p>
              </div>
            )}

            {error && (
              <div className="rounded-lg border border-rose-400/40 bg-rose-950/40 p-3 text-xs text-rose-100 flex gap-2">
                <AlertTriangle className="size-4 shrink-0 mt-0.5" />
                <p>{error}</p>
              </div>
            )}

            <div className="space-y-1.5">
              {devices.map((dev) => {
                const busy = sendingTo === dev.ip;
                return (
                  <div
                    key={dev.ip}
                    className="rounded-lg border border-violet-500/30 bg-violet-950/60 p-2.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate flex items-center gap-1.5">
                          <Tv className="size-3.5 text-violet-300 shrink-0" /> {deviceLabel(dev)}
                        </p>
                        <p className="text-[11px] text-muted-foreground truncate">
                          {dev.ip}
                          {dev.deviceModel ? ` · ${dev.deviceModel}` : ""}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        className="h-8 shrink-0 bg-gradient-primary text-primary-foreground hover:opacity-90"
                        disabled={!!sendingTo}
                        onClick={() => onSend(dev)}
                      >
                        {busy ? <Loader2 className="size-3.5 animate-spin" /> : "Send"}
                      </Button>
                    </div>
                    {busy && progress && (
                      <div className="mt-2">
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-violet-900">
                          <div
                            className="h-full bg-violet-400 transition-all"
                            style={{ width: `${progress.phase === "sending" ? progress.percent : 3}%` }}
                          />
                        </div>
                        <p className="mt-1 text-[11px] text-violet-200">
                          {PHASE_TEXT[progress.phase]}
                          {progress.phase === "sending" ? ` ${progress.percent}%` : ""}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}

              {devices.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-3">
                  {scanning
                    ? "Scanning your Wi-Fi for LocalSend devices…"
                    : "No LocalSend devices found. Open LocalSend on the TV, then scan again."}
                </p>
              )}
            </div>

            <Button
              size="sm"
              variant="secondary"
              className="w-full h-8"
              disabled={scanning || !!sendingTo}
              onClick={startScan}
            >
              {scanning ? (
                <Loader2 className="size-3.5 mr-1 animate-spin" />
              ) : (
                <RefreshCw className="size-3.5 mr-1" />
              )}
              {scanning ? "Scanning…" : "Scan again"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
