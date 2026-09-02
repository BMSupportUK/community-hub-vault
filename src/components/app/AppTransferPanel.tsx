import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import QRCode from "qrcode";
import { Smartphone, Copy, Download, Trash2, Loader2, ShieldCheck, Clock, Film, Eye, Lock, Wifi } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import {
  listAppBuilds,
  listMyAppTransfers,
  requestAppTransfer,
  deleteMyAppTransfer,
  requestAppDownloadAccess,
} from "@/lib/app-transfer.functions";
import { useAuth } from "@/hooks/use-auth";
import { LocalSendDialog } from "@/components/app/LocalSendDialog";

type Build = Awaited<ReturnType<typeof listAppBuilds>>[number];
type Transfer = Awaited<ReturnType<typeof listMyAppTransfers>>[number];

function formatSize(bytes: number | null) {
  if (!bytes) return null;
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(mb < 10 ? 1 : 0)} MB`;
}

function useTick() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

function countdown(expiresAt: string | undefined, now: number) {
  if (!expiresAt) return null;
  const ms = new Date(expiresAt).getTime() - now;
  if (ms <= 0) return "expired";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
}

/** Signs a private app-demos video path for playback. */
function useDemoVideoUrl(path: string | null) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancel = false;
    setUrl(null);
    if (!path) return;
    supabase.storage
      .from("app-demos")
      .createSignedUrl(path, 3600)
      .then(({ data }) => {
        if (!cancel) setUrl(data?.signedUrl ?? null);
      })
      .catch(() => {});
    return () => {
      cancel = true;
    };
  }, [path]);
  return url;
}

function AppCard({ build, transfer, now }: { build: Build; transfer: Transfer | undefined; now: number }) {
  const queryClient = useQueryClient();
  const request = useServerFn(requestAppTransfer);
  const remove = useServerFn(deleteMyAppTransfer);
  const [busy, setBusy] = useState<"request" | "delete" | null>(null);
  const [open, setOpen] = useState(false);
  const [wifiOpen, setWifiOpen] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const videoUrl = useDemoVideoUrl(build.videoPath);

  const shortUrl = useMemo(() => {
    if (!transfer) return null;
    const host = typeof window === "undefined" ? "bmsupport.uk" : window.location.host;
    return `${host}/a/${transfer.token}`;
  }, [transfer]);

  const remaining = countdown(transfer?.expiresAt, now);

  useEffect(() => {
    let cancel = false;
    if (!shortUrl) {
      setQrDataUrl(null);
      return;
    }
    QRCode.toDataURL(`https://${shortUrl}`, {
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
  }, [shortUrl]);

  useEffect(() => {
    if (remaining === "expired") {
      queryClient.invalidateQueries({ queryKey: ["app-transfers"] });
      queryClient.invalidateQueries({ queryKey: ["app-transfer"] });
      if (open) setOpen(false);
    }
  }, [remaining, open, queryClient]);

  const onRequest = async () => {
    setBusy("request");
    try {
      await request({ data: { buildId: build.id } });
      await queryClient.invalidateQueries({ queryKey: ["app-transfers"] });
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
      await remove({ data: { buildId: build.id } });
      await queryClient.invalidateQueries({ queryKey: ["app-transfers"] });
      await queryClient.invalidateQueries({ queryKey: ["app-transfer"] });
      toast.success("Link deleted — no record kept");
      setOpen(false);
    } catch {
      toast.error("Couldn't delete the link");
    } finally {
      setBusy(null);
    }
  };

  const size = formatSize(build.fileSize);
  const hasLiveLink = transfer && remaining !== "expired";

  return (
    <>
      <article className="rounded-xl border border-violet-500/30 bg-violet-950/40 p-3 flex flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h4 className="font-display text-sm font-semibold text-foreground flex items-center gap-1.5 truncate">
              <Smartphone className="size-3.5 text-violet-300 shrink-0" />
              {build.appName || build.fileName}
            </h4>
            {build.versionName && (
              <p className="text-[11px] text-violet-200 mt-0.5 truncate">{build.versionName}</p>
            )}
          </div>
          <div className="text-[11px] text-muted-foreground text-right shrink-0">
            {build.fileName}
            {size ? ` · ${size}` : ""}
          </div>
        </div>

        {build.releaseNotes && (
          <p className="text-xs text-foreground/80 whitespace-pre-wrap line-clamp-2">{build.releaseNotes}</p>
        )}

        {build.installInstructions && (
          <div className="rounded-lg border border-violet-500/30 bg-violet-500/10 p-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-violet-200">Install instructions</p>
            <p className="mt-1 text-xs text-foreground/85 whitespace-pre-wrap line-clamp-3">{build.installInstructions}</p>
          </div>
        )}

        {build.videoPath && (
          <div className="overflow-hidden rounded-lg border border-violet-500/30 bg-black/50">
            {videoUrl ? (
              <video
                src={videoUrl}
                controls
                controlsList="nodownload noplaybackrate"
                disablePictureInPicture
                onContextMenu={(e) => e.preventDefault()}
                className="w-full max-h-[120px] bg-black"
              />
            ) : (
              <div className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
                <Film className="size-3.5" /> Loading walkthrough…
              </div>
            )}
          </div>
        )}


        <div className="mt-auto pt-1">
          {!hasLiveLink ? (
            <Button
              size="sm"
              onClick={onRequest}
              disabled={busy === "request"}
              className="bg-gradient-primary text-primary-foreground shadow-glow hover:opacity-90 w-full h-8"
            >
              {busy === "request" ? <Loader2 className="size-3.5 mr-1 animate-spin" /> : <ShieldCheck className="size-3.5 mr-1" />}
              Request Your App Download Link
            </Button>
          ) : (
            <div className="space-y-1.5">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setOpen(true)}
                className="w-full h-8"
              >
                <Eye className="size-3.5 mr-1" /> View download options
              </Button>
              <p className="text-[10px] text-center text-muted-foreground flex items-center justify-center gap-1">
                <Clock className="size-3" /> Link expires in {remaining}
              </p>
            </div>
          )}
        </div>

      </article>

      <LocalSendDialog
        open={wifiOpen}
        onOpenChange={setWifiOpen}
        appName={build.appName || build.fileName}
        fileName={build.fileName}
        fileSize={build.fileSize ?? 0}
        fileUrl={transfer ? `https://${typeof window === "undefined" ? "bmsupport.uk" : window.location.host}/api/public/a/${transfer.token}` : ""}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm sm:max-w-md border-violet-500/30 bg-violet-950/95 backdrop-blur-sm">
          <DialogHeader>
            <DialogTitle className="font-display text-base flex items-center gap-2">
              <Smartphone className="size-4 text-violet-300" /> {build.appName || build.fileName}
            </DialogTitle>
            <DialogDescription>
              24-hour secure install link. Scan the QR code or type the URL into Downloader on your device.
            </DialogDescription>
          </DialogHeader>

          {shortUrl && (
            <div className="rounded-lg border border-emerald-400/40 bg-emerald-950/40 p-3">
              <p className="text-[10px] uppercase tracking-wider text-emerald-300/90 font-semibold">
                Type into Downloader on your device
              </p>
              <div className="mt-1.5 flex items-center justify-between gap-2">
                <span className="font-mono text-sm tracking-wide text-foreground break-all">{shortUrl}</span>
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
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                Code: <span className="font-mono tracking-[0.2em] text-foreground">{transfer?.token}</span>
              </p>
            </div>
          )}

          <div className="flex flex-col items-center gap-3">
            <div className="rounded-xl bg-white p-2">
              {qrDataUrl ? (
                <img src={qrDataUrl} alt="Secure install link QR code" className="block size-[192px]" />
              ) : (
                <div className="flex size-[192px] items-center justify-center">
                  <Loader2 className="size-5 animate-spin text-violet-600" />
                </div>
              )}
            </div>
            <p className="text-xs text-center text-muted-foreground">Scan with your phone camera</p>
          </div>

          <p className="text-xs text-violet-200 flex items-center justify-center gap-1.5">
            <Clock className="size-3.5" /> Expires in {remaining} · downloads: {transfer?.downloads ?? 0}
          </p>

          <div className="flex flex-wrap gap-2 justify-center">
            <Button size="sm" asChild className="bg-gradient-primary text-primary-foreground hover:opacity-90 h-9">
              <a href={`/api/public/a/${transfer?.token}`}>
                <Download className="size-4 mr-1" /> Download to this device
              </a>
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className="h-9"
              onClick={() => {
                setOpen(false);
                setWifiOpen(true);
              }}
            >
              <Wifi className="size-4 mr-1" /> Send over Wi-Fi
            </Button>
            <Button size="sm" variant="secondary" className="h-9" disabled={busy === "delete"} onClick={onDelete}>
              {busy === "delete" ? <Loader2 className="size-4 mr-1 animate-spin" /> : <Trash2 className="size-4 mr-1" />}
              Delete link
            </Button>
          </div>

        </DialogContent>
      </Dialog>
    </>
  );
}

/** Members without the subscriber role ask staff for access instead of getting a link. */
function RequestAccessPanel() {
  const askAccess = useServerFn(requestAppDownloadAccess);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const onAsk = async () => {
    setBusy(true);
    try {
      const res = await askAccess();
      setSent(true);
      toast.success(
        res?.alreadySent
          ? "Your request is already with the admin team"
          : "Request sent — an admin has been notified",
      );
    } catch {
      toast.error("Couldn't send your request, please try again");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-2xl border border-violet-500/30 bg-violet-950/40 p-6">
      <h3 className="font-display text-lg font-semibold text-foreground flex items-center gap-2">
        <Lock className="size-5 text-violet-300" /> Download Link
      </h3>
      <p className="text-sm text-muted-foreground mt-2 max-w-prose">
        The BM App Store download section is available to subscribers. Request access and an admin
        will be notified to review your account.
      </p>
      <Button
        onClick={onAsk}
        disabled={busy || sent}
        className="mt-4 bg-gradient-primary text-primary-foreground shadow-glow hover:opacity-90"
      >
        {busy ? <Loader2 className="size-4 mr-1 animate-spin" /> : <ShieldCheck className="size-4 mr-1" />}
        {sent ? "Request sent" : "Request access"}
      </Button>
    </section>
  );
}

export function AppTransferPanel({ onUploadClick }: { onUploadClick?: () => void } = {}) {
  const fetchBuilds = useServerFn(listAppBuilds);
  const fetchTransfers = useServerFn(listMyAppTransfers);
  const now = useTick();
  const { hasAny } = useAuth();
  const canDownload = hasAny(["subscriber", "admin", "management", "staff"]);

  const { data: builds } = useQuery({
    queryKey: ["app-builds"],
    queryFn: () => fetchBuilds(),
    staleTime: 60_000,
    enabled: canDownload,
  });
  const { data: transfers } = useQuery({
    queryKey: ["app-transfers"],
    queryFn: () => fetchTransfers(),
    enabled: canDownload,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const byBuild = useMemo(() => {
    const map = new Map<string, Transfer>();
    for (const t of transfers ?? []) if (!map.has(t.buildId)) map.set(t.buildId, t);
    return map;
  }, [transfers]);

  if (!canDownload) return <RequestAccessPanel />;

  if (!builds || builds.length === 0) {
    return (
      <section className="rounded-2xl border border-violet-500/30 bg-violet-950/40 p-6">
        <h3 className="font-display text-lg font-semibold text-foreground flex items-center gap-2">
          <Smartphone className="size-5 text-violet-300" /> Get the App
        </h3>
        <p className="text-sm text-muted-foreground mt-2 max-w-prose">
          No apps are published yet. Once they're available you'll be able to request a secure
          24-hour install link for your Amazon Fire Stick or Android device right here.
        </p>
        {onUploadClick && (
          <Button
            onClick={onUploadClick}
            className="mt-4 bg-gradient-primary text-primary-foreground shadow-glow hover:opacity-90"
          >
            <ShieldCheck className="size-4 mr-1" /> Upload an APK
          </Button>
        )}
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div>
        <h3 className="font-display text-lg font-semibold text-foreground flex items-center gap-2">
          <Smartphone className="size-5 text-violet-300" /> Get the App
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          Install our apps on your Amazon Fire Stick or Android device using a secure link that only
          works for 24 hours. Each app has its own link.
        </p>
      </div>
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        {builds.map((b) => (
          <AppCard key={b.id} build={b} transfer={byBuild.get(b.id)} now={now} />
        ))}
      </div>
    </section>
  );
}
