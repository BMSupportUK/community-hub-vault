import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import QRCode from "qrcode";
import { Smartphone, Copy, Download, Trash2, Loader2, ShieldCheck, Clock, Eye, Lock, ZoomIn, ZoomOut, Apple, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  APP_BUILD_CATEGORIES,
  listAppBuilds,
  listMyAppTransfers,
  requestAppTransfer,
  deleteMyAppTransfer,
  requestAppDownloadAccess,
} from "@/lib/app-transfer.functions";
import { useAuth } from "@/hooks/use-auth";

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

/** Step-by-step install status shown under a live link. */
function TransferStatusSteps({ transfer }: { transfer: Transfer }) {
  const installed = !!transfer.installedAt;
  const downloaded = installed || transfer.status === "completed";
  const downloading = !downloaded && transfer.status === "downloading";
  const started = downloaded || downloading || transfer.status === "incomplete";
  const pct =
    transfer.totalBytes && transfer.totalBytes > 0
      ? Math.min(100, Math.round((transfer.bytes / transfer.totalBytes) * 100))
      : downloaded
        ? 100
        : 0;

  // Third-party APKs never report installs, so only show that step when an app actually reported.
  const steps: { label: string; state: "done" | "active" | "todo" }[] = [
    { label: "Link issued", state: "done" },
    {
      label: downloading ? `Downloading… ${pct}%` : "Downloaded",
      state: downloaded ? "done" : downloading ? "active" : "todo",
    },
  ];
  if (installed) steps.push({ label: "Installed & opened", state: "done" });

  return (
    <div className="rounded-lg border border-border/60 bg-background/60 p-3">
      <ol className="grid min-w-0 grid-cols-1 gap-2 sm:flex sm:items-center sm:gap-1">
        {steps.map((s, i) => (
          <li key={s.label} className="flex min-w-0 flex-1 items-center gap-2 sm:gap-1 sm:last:flex-none">
            <span
              className={`grid size-5 shrink-0 place-items-center rounded-full border text-[10px] font-bold ${
                s.state === "done"
                  ? "border-emerald-400/50 bg-emerald-500/20 text-emerald-300"
                  : s.state === "active"
                    ? "border-sky-400/50 bg-sky-500/20 text-sky-300"
                    : "border-border bg-surface text-muted-foreground"
              }`}
            >
              {s.state === "done" ? "✓" : i + 1}
            </span>
             <span
               className={`min-w-0 break-words text-[10px] leading-tight ${
                s.state === "done"
                  ? "text-emerald-300"
                  : s.state === "active"
                    ? "text-sky-300"
                    : "text-muted-foreground"
              }`}
            >
              {s.label}
            </span>
             {i < steps.length - 1 && <span className="mx-1 hidden h-px flex-1 bg-border sm:block" />}
          </li>
        ))}
      </ol>
      {downloading && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
          <div className="h-full bg-sky-400 transition-all" style={{ width: `${pct}%` }} />
        </div>
      )}
      {(installed || started) && (
        <p className="mt-2 text-[10px] text-muted-foreground">
          {installed
            ? `Opened on ${transfer.installDevice || "the device"}${transfer.installAppVersion ? ` · app v${transfer.installAppVersion}` : ""} · ${new Date(transfer.installedAt!).toLocaleString()}`
            : transfer.device
              ? `Device: ${transfer.device}`
              : null}
        </p>
      )}
    </div>
  );
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
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [infoZoom, setInfoZoom] = useState(1);
  const videoUrl = useDemoVideoUrl(build.videoPath);

  const shortUrl = useMemo(() => {
    if (!transfer) return null;
    const host = typeof window === "undefined" ? "bmsupport.uk" : window.location.host;
    return `${host}/${transfer.token}`;
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
      setOpen(true);
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
       <article className="group flex min-w-0 flex-col overflow-hidden rounded-lg border border-border/70 bg-surface shadow-soft transition-all hover:border-violet-500/40 hover:shadow-[0_0_30px_-10px_rgba(217,70,239,0.6)] md:grid md:grid-cols-[minmax(220px,42%)_minmax(0,1fr)] xl:flex xl:h-full xl:min-h-min">
        <div className="relative aspect-[16/10] overflow-hidden bg-black/70 md:h-full md:min-h-0 md:aspect-auto xl:h-auto xl:min-h-[120px] xl:flex-1 xl:aspect-auto">
          {build.videoPath && videoUrl ? (
            <video
              src={videoUrl}
              controls
              controlsList="nodownload noplaybackrate"
              disablePictureInPicture
              onContextMenu={(e) => e.preventDefault()}
              className="absolute inset-0 w-full h-full object-contain group-hover:scale-[1.02] transition-transform"
            />
          ) : (
            <div className="w-full h-full grid place-items-center text-violet-300/60">
              <Smartphone className="size-10" />
            </div>
          )}
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3 sm:p-4 xl:flex-none xl:overflow-visible">
          <div className="flex flex-wrap items-center gap-2">
             <h4 className="flex min-w-0 items-center gap-1.5 break-words font-display text-base font-semibold leading-snug text-foreground sm:text-lg">
              <Smartphone className="size-4 text-violet-300 shrink-0" />
              {build.appName || build.fileName}
            </h4>
            {build.versionName && (
              <span className="text-xs px-2 py-1 rounded-md bg-violet-500/20 text-violet-200 font-medium border border-violet-500/30">
                {build.versionName}
              </span>
            )}
          </div>

          {build.releaseNotes && (
            <p className="text-sm text-violet-200/70 line-clamp-2">{build.releaseNotes}</p>
          )}

           <div className="break-all text-[11px] text-muted-foreground">
            {build.fileName}
            {size ? ` · ${size}` : ""}
          </div>

          <div className="mt-auto pt-3 flex items-center gap-2">
            {!hasLiveLink ? (
              <Button
                size="sm"
                onClick={onRequest}
                disabled={busy === "request"}
                className="bg-gradient-primary text-primary-foreground shadow-glow hover:opacity-90 flex-1 h-auto min-h-9 whitespace-normal py-2"
              >
                {busy === "request" ? <Loader2 className="size-3.5 mr-1 animate-spin shrink-0" /> : <ShieldCheck className="size-3.5 mr-1 shrink-0" />}
                <span>Request download link</span>
              </Button>
            ) : (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setOpen(true)}
                className="flex-1 h-auto min-h-9 whitespace-normal py-2"
              >
                <Eye className="size-3.5 mr-1 shrink-0" /> <span>View download options</span>
              </Button>
            )}
          </div>

          {hasLiveLink && (
            <p className="text-[10px] text-center text-muted-foreground flex items-center justify-center gap-1">
              <Clock className="size-3" /> Link expires in {remaining}
            </p>
          )}
        </div>
      </article>


      <Dialog open={open} onOpenChange={setOpen}>
         <DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-sm overflow-x-hidden overflow-y-auto border-violet-500/30 bg-violet-950/95 p-4 backdrop-blur-sm sm:max-w-md sm:p-6">
          <DialogHeader>
            <DialogTitle className="font-display text-base flex items-center gap-2">
              <Smartphone className="size-4 text-violet-300" /> {build.appName || build.fileName}
            </DialogTitle>
            <DialogDescription>
              24-hour secure install link. Scan the QR code or type the URL into Downloader on your device.
            </DialogDescription>
          </DialogHeader>

          {build.installInstructions && (
            <div className="rounded-lg border border-violet-500/30 bg-violet-500/10 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-violet-200">Additional App Information</p>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-9 text-violet-200 hover:text-foreground hover:bg-surface-2/80 disabled:opacity-40 sm:size-7"
                    title="Smaller text"
                    disabled={infoZoom <= 1}
                    onClick={() => setInfoZoom((z) => Math.max(1, +(z - 0.25).toFixed(2)))}
                  >
                    <ZoomOut className="size-5 sm:size-3.5" />
                  </Button>
                  <span className="min-w-9 text-center text-xs font-semibold text-violet-200 sm:min-w-8 sm:text-[10px]">{Math.round(infoZoom * 100)}%</span>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-9 text-violet-200 hover:text-foreground hover:bg-surface-2/80 disabled:opacity-40 sm:size-7"
                    title="Bigger text"
                    disabled={infoZoom >= 3}
                    onClick={() => setInfoZoom((z) => Math.min(3, +(z + 0.25).toFixed(2)))}
                  >
                    <ZoomIn className="size-5 sm:size-3.5" />
                  </Button>
                </div>
              </div>
              <p
                className="mt-1.5 text-xs text-foreground/85 whitespace-pre-wrap"
                style={{ fontSize: `${infoZoom * 0.75}rem`, lineHeight: 1.5 }}
              >
                {build.installInstructions}
              </p>
            </div>
          )}

          {shortUrl && (
            <div className="rounded-lg border border-emerald-400/40 bg-emerald-950/40 p-3">
              <p className="text-[10px] uppercase tracking-wider text-emerald-300/90 font-semibold">
                Type into Downloader on your device
              </p>
               <div className="mt-1.5 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
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
            </div>
          )}

          <div className="flex flex-col items-center gap-3">
             <div className="max-w-full rounded-xl bg-white p-2">
              {qrDataUrl ? (
                 <img src={qrDataUrl} alt="Secure install link QR code" className="block size-40 sm:size-[192px]" />
              ) : (
                 <div className="flex size-40 items-center justify-center sm:size-[192px]">
                  <Loader2 className="size-5 animate-spin text-violet-600" />
                </div>
              )}
            </div>
            <p className="text-xs text-center text-muted-foreground">Scan with your phone camera</p>
          </div>

          <p className="text-xs text-violet-200 flex items-center justify-center gap-1.5">
            <Clock className="size-3.5" /> Expires in {remaining} · downloads: {transfer?.downloads ?? 0}
          </p>

          {transfer && <TransferStatusSteps transfer={transfer} />}

          <div className="flex flex-col sm:flex-row flex-wrap gap-2 justify-center">
            <Button size="sm" asChild className="bg-gradient-primary text-primary-foreground hover:opacity-90 h-auto min-h-9 w-full sm:w-auto whitespace-normal">
              <a href={`/api/public/a/${transfer?.token}`}>
                <Download className="size-4 mr-1 shrink-0" /> <span>Download to this device</span>
              </a>
            </Button>
            <Button size="sm" variant="secondary" className="h-auto min-h-9 w-full sm:w-auto whitespace-normal" disabled={busy === "delete"} onClick={onDelete}>
              {busy === "delete" ? <Loader2 className="size-4 mr-1 animate-spin shrink-0" /> : <Trash2 className="size-4 mr-1 shrink-0" />}
              <span>Delete link</span>
            </Button>
          </div>

        </DialogContent>
      </Dialog>
    </>
  );
}

/** Apple App Store listing for Purple Player Lite — the iOS Purple Player card links here. */
const IOS_PURPLE_STORE_URL = "https://apps.apple.com/gb/app/purple-lite-iptv-player/id6749171817";

/** Static iOS card with App Store download information in a dialog. */
function IosPurpleCard() {
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
    <section className="rounded-2xl border border-border/80 bg-background/90 p-6 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.7)] backdrop-blur-xl">
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
    refetchInterval: 15_000,
    staleTime: 10_000,
  });

  const byBuild = useMemo(() => {
    const map = new Map<string, Transfer>();
    for (const t of transfers ?? []) if (!map.has(t.buildId)) map.set(t.buildId, t);
    return map;
  }, [transfers]);

  const grouped = useMemo(() => {
    const map: Record<string, Build[]> = {};
    for (const b of builds ?? []) {
      const key = (b.category ?? "bm_store") as string;
      (map[key] ??= []).push(b);
    }
    return map;
  }, [builds]);

  // BM Support App Store is the default and shows first in the download tabs.
  const orderedCategories = useMemo(
    () => [
      ...[...APP_BUILD_CATEGORIES].sort((a, b) => (a.key === "bm_store" ? -1 : b.key === "bm_store" ? 1 : 0)),
      { key: "ios", label: "iOS" },
    ],
    [],
  );
  const firstTab = "bm_store";

  if (!canDownload) return <RequestAccessPanel />;

  if (!builds || builds.length === 0) {
    return (
      <section className="rounded-2xl border border-border/80 bg-background/90 p-6 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.7)] backdrop-blur-xl">
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
     <section className="min-w-0 overflow-hidden rounded-lg border border-border/80 bg-background/90 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.7)] backdrop-blur-xl md:flex md:min-h-0 md:flex-1 md:flex-col">
       <div className="grid min-w-0 grid-cols-1 gap-2 border-b border-border/60 px-3 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:px-5 sm:py-4 md:px-4 md:py-2 lg:px-5 lg:py-3">
         <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-gradient-primary text-primary-foreground shadow-glow">
            <Smartphone className="size-5" />
          </span>
           <div className="min-w-0">
            <h3 className="font-display text-lg font-semibold text-foreground">Get the App</h3>
             <p className="text-xs text-muted-foreground break-words">
              Secure 24-hour install links for your Fire Stick or Android device — each app has its own link.
            </p>
          </div>
        </div>
          <span className="inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full border border-emerald-400/40 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-300">
          <ShieldCheck className="size-3" /> Secure links
        </span>
      </div>
        <div className="min-w-0 p-3 sm:p-5 md:flex md:min-h-0 md:flex-1 md:flex-col md:p-3 lg:p-4">
        <Tabs defaultValue={firstTab} className="min-w-0 w-full md:flex md:min-h-0 md:flex-1 md:flex-col">
          <TabsList className="grid h-auto w-full min-w-0 shrink-0 grid-cols-2 gap-1 bg-surface-2/80 p-1 sm:flex sm:flex-wrap sm:justify-start">
          {orderedCategories.map((c) => (
             <TabsTrigger key={c.key} value={c.key} className="min-w-0 whitespace-normal px-2 text-xs leading-tight sm:shrink-0 sm:text-sm">
              {c.label}
              <span className="ml-1.5 text-[10px] opacity-70">{(grouped[c.key] ?? []).length + (c.key === "ios" ? 1 : 0)}</span>
            </TabsTrigger>
          ))}
        </TabsList>
        {orderedCategories.map((c) => (
          <TabsContent key={c.key} value={c.key} className="mt-4 md:min-h-0 md:flex-1 md:overflow-y-auto md:mt-2 lg:mt-3">
            {(grouped[c.key] ?? []).length === 0 && c.key !== "ios" ? (
              <div className="grid place-items-center rounded-xl border border-dashed border-border/70 bg-surface/60 px-6 py-12 text-center">
                <Smartphone className="size-8 text-muted-foreground/50" />
                <p className="mt-2 text-sm text-muted-foreground">No apps in this section yet.</p>
              </div>
            ) : (
               <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 md:h-full md:auto-rows-fr md:grid-cols-1 lg:gap-5 xl:h-full xl:auto-rows-auto xl:grid-cols-3">
                {(grouped[c.key] ?? []).map((b) => (
                  <AppCard key={b.id} build={b} transfer={byBuild.get(b.id)} now={now} />
                ))}
                {c.key === "ios" && <IosPurpleCard />}
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>
      </div>
    </section>
  );
}
