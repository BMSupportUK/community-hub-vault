import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import QRCode from "qrcode";
import { Smartphone, Copy, Download, Trash2, Loader2, ShieldCheck, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getCurrentAppBuild,
  getMyAppTransfer,
  requestAppTransfer,
  deleteMyAppTransfer,
} from "@/lib/app-transfer.functions";

function formatSize(bytes: number | null) {
  if (!bytes) return null;
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(mb < 10 ? 1 : 0)} MB`;
}

function useCountdown(expiresAt: string | undefined) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  if (!expiresAt) return null;
  const ms = new Date(expiresAt).getTime() - now;
  if (ms <= 0) return "expired";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
}

export function AppTransferPanel({ onUploadClick }: { onUploadClick?: () => void } = {}) {
  const queryClient = useQueryClient();
  const fetchBuild = useServerFn(getCurrentAppBuild);
  const fetchTransfer = useServerFn(getMyAppTransfer);
  const request = useServerFn(requestAppTransfer);
  const remove = useServerFn(deleteMyAppTransfer);
  const [busy, setBusy] = useState<"request" | "delete" | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const { data: build } = useQuery({
    queryKey: ["app-build"],
    queryFn: () => fetchBuild(),
    staleTime: 60_000,
  });
  const { data: transfer } = useQuery({
    queryKey: ["app-transfer"],
    queryFn: () => fetchTransfer(),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const shortUrl = useMemo(() => {
    if (!transfer) return null;
    const host = typeof window === "undefined" ? "bmsupport.uk" : window.location.host;
    return `${host}/a/${transfer.token}`;
  }, [transfer]);

  const remaining = useCountdown(transfer?.expiresAt);

  useEffect(() => {
    if (!shortUrl || !canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, `https://${shortUrl}`, {
      width: 132,
      margin: 1,
      color: { dark: "#0b0616", light: "#ffffff" },
    }).catch(() => {});
  }, [shortUrl]);

  useEffect(() => {
    if (remaining === "expired") {
      queryClient.invalidateQueries({ queryKey: ["app-transfer"] });
    }
  }, [remaining, queryClient]);

  if (!build || !build.isAvailable) {
    return (
      <section className="rounded-2xl border border-violet-500/30 bg-violet-950/40 p-6">
        <h3 className="font-display text-lg font-semibold text-foreground flex items-center gap-2">
          <Smartphone className="size-5 text-violet-300" /> Get the App
        </h3>
        <p className="text-sm text-muted-foreground mt-2 max-w-prose">
          {build && !build.isAvailable
            ? "The app is temporarily unavailable while we prepare a new version. Check back shortly."
            : "The app isn't published yet. Once it's available you'll be able to request a secure 24-hour install link for your Amazon Fire Stick or Android device right here."}
        </p>
        {onUploadClick && (
          <Button
            onClick={onUploadClick}
            className="mt-4 bg-gradient-primary text-primary-foreground shadow-glow hover:opacity-90"
          >
            <ShieldCheck className="size-4 mr-1" /> Upload the APK
          </Button>
        )}
      </section>
    );
  }

  const onRequest = async () => {
    setBusy("request");
    try {
      await request();
      await queryClient.invalidateQueries({ queryKey: ["app-transfer"] });
      toast.success("Secure link created — valid for 24 hours");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't create the link");
    } finally {
      setBusy(null);
    }
  };

  const onDelete = async () => {
    setBusy("delete");
    try {
      await remove();
      await queryClient.invalidateQueries({ queryKey: ["app-transfer"] });
      toast.success("Link deleted — no record kept");
    } catch {
      toast.error("Couldn't delete the link");
    } finally {
      setBusy(null);
    }
  };

  const size = formatSize(build.fileSize);

  return (
    <section className="rounded-2xl border border-violet-500/30 bg-violet-950/40 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-lg font-semibold text-foreground flex items-center gap-2">
            <Smartphone className="size-5 text-violet-300" /> Get the App
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Install the BM Support app on your Amazon Fire Stick or Android device using a secure
            link that only works for 24 hours.
          </p>
        </div>
        <div className="text-xs text-muted-foreground text-right">
          {build.versionName && <div className="text-foreground font-medium">{build.versionName}</div>}
          <div>{build.fileName}{size ? ` · ${size}` : ""}</div>
        </div>
      </div>

      {build.releaseNotes && (
        <p className="mt-3 text-sm text-foreground/80 whitespace-pre-wrap">{build.releaseNotes}</p>
      )}

      {!transfer || remaining === "expired" ? (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button
            onClick={onRequest}
            disabled={busy === "request"}
            className="bg-gradient-primary text-primary-foreground shadow-glow hover:opacity-90"
          >
            {busy === "request" ? <Loader2 className="size-4 mr-1 animate-spin" /> : <ShieldCheck className="size-4 mr-1" />}
            Request transfer
          </Button>
          <span className="text-xs text-muted-foreground">
            You'll get a short code to type into the Downloader app, plus a QR code for phones.
          </span>
        </div>
      ) : (
        <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_auto] items-start">
          <div className="space-y-3">
            <div className="rounded-xl border border-emerald-400/40 bg-emerald-950/40 p-3">
              <p className="text-[11px] uppercase tracking-wider text-emerald-300/90 font-semibold">
                Type this into Downloader on your compatible streaming device
              </p>
              <div className="mt-1 flex items-center justify-between gap-2">
                <span className="font-mono text-base sm:text-lg tracking-wide text-foreground break-all">
                  {shortUrl}
                </span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-8 shrink-0 text-emerald-200 hover:text-foreground hover:bg-surface-2/80"
                  title="Copy link"
                  onClick={() => {
                    navigator.clipboard.writeText(`https://${shortUrl}`);
                    toast.success("Link copied");
                  }}
                >
                  <Copy className="size-4" />
                </Button>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Transfer code: <span className="font-mono tracking-[0.2em] text-foreground">{transfer.token}</span>
              </p>
            </div>

            <p className="text-xs text-violet-200 flex items-center gap-1.5">
              <Clock className="size-3.5" /> Expires in {remaining} · downloads: {transfer.downloads}
            </p>

            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm" className="bg-gradient-primary text-primary-foreground hover:opacity-90">
                <a href={`/api/public/a/${transfer.token}`}>
                  <Download className="size-4 mr-1" /> Download to this device
                </a>
              </Button>
              <Button size="sm" variant="secondary" disabled={busy === "delete"} onClick={onDelete}>
                {busy === "delete" ? <Loader2 className="size-4 mr-1 animate-spin" /> : <Trash2 className="size-4 mr-1" />}
                Delete link
              </Button>
            </div>
          </div>

          <div className="rounded-xl bg-white p-2 justify-self-start">
            <canvas ref={canvasRef} className="block size-[132px]" />
          </div>
        </div>
      )}
    </section>
  );
}
