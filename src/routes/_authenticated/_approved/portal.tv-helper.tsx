import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Download, Loader2, ShieldCheck, Tv, Play } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { RemoteHelper, remoteHelperAvailable, type RemoteHelperStatus } from "@/lib/remote-helper";

export const Route = createFileRoute("/_authenticated/_approved/portal/tv-helper")({
  component: TvHelperPage,
  head: () => ({
    meta: [
      { title: "TV Remote Helper | BM Support" },
      { name: "description", content: "Install BM Remote Helper on your TV so BM Support can help you on screen." },
      { property: "og:title", content: "TV Remote Helper | BM Support" },
      { property: "og:description", content: "Install BM Remote Helper on your TV so BM Support can help you on screen." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function TvHelperPage() {
  const [native, setNative] = useState(false);
  const [status, setStatus] = useState<RemoteHelperStatus | null>(null);
  const [outdated, setOutdated] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setStatus(await RemoteHelper.status());
    } catch {
      setOutdated(true);
    }
  }, []);

  useEffect(() => {
    const ok = remoteHelperAvailable();
    setNative(ok);
    if (!ok) return;
    void refresh();
    const onFocus = () => void refresh();
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("focus", onFocus);
    const t = window.setInterval(refresh, 3000);
    return () => {
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("focus", onFocus);
      window.clearInterval(t);
    };
  }, [refresh]);

  const install = async () => {
    setBusy(true);
    try {
      await RemoteHelper.install();
      toast.success("Downloading BM Remote Helper — press Install when the TV asks");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("NEEDS_PERMISSION")) {
        await RemoteHelper.allowInstalls();
        toast("Switch on BM Support, then press Back and try again");
      } else {
        toast.error(msg || "Install failed");
      }
    } finally {
      setBusy(false);
      void refresh();
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl p-4 md:p-8">
      <div className="rounded-2xl border border-border bg-card p-6 shadow-glow md:p-8">
        <div className="mb-6 flex items-center gap-3">
          <Tv className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">TV Remote Helper</h1>
            <p className="text-sm text-muted-foreground">Lets BM Support staff help you on your TV screen, only when you allow it.</p>
          </div>
        </div>

        {!native ? (
          <p className="rounded-lg border border-border bg-muted/40 p-4 text-sm">
            Open this page in the <strong>BM Support app on your TV</strong> to install the helper.
          </p>
        ) : outdated ? (
          <p className="rounded-lg border border-border bg-muted/40 p-4 text-sm">
            Your BM Support app needs updating first. Download the latest BM Support app, then come back here.
          </p>
        ) : !status ? (
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        ) : (
          <ol className="space-y-4">
            <Step n={1} done={status.installed} title="Install BM Remote Helper">
              {!status.canInstall && !status.installed && (
                <p className="mb-2 text-sm text-muted-foreground">The first time, your TV asks to let BM Support install apps. Switch it on, then press Back.</p>
              )}
              <Button onClick={install} disabled={busy} size="lg">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                {status.installed ? "Update Remote Helper" : "Install Remote Helper"}
              </Button>
            </Step>
            <Step n={2} done={status.accessibilityOn} title="Turn on the Accessibility switch">
              <p className="mb-2 text-sm text-muted-foreground">Choose BM Remote Helper, switch it on and press Allow.</p>
              <Button onClick={() => RemoteHelper.openAccessibility()} disabled={!status.installed} variant="secondary" size="lg">
                <ShieldCheck className="h-4 w-4" /> Open Accessibility settings
              </Button>
            </Step>
            <Step n={3} done={false} title="Open the helper and read the code to staff">
              <Button onClick={() => RemoteHelper.openHelper()} disabled={!status.installed} variant="secondary" size="lg">
                <Play className="h-4 w-4" /> Open Remote Helper
              </Button>
            </Step>
          </ol>
        )}
      </div>
    </div>
  );
}

function Step({ n, done, title, children }: { n: number; done: boolean; title: string; children: React.ReactNode }) {
  return (
    <li className="rounded-xl border border-border p-4">
      <div className="mb-3 flex items-center gap-2 font-semibold">
        {done ? <CheckCircle2 className="h-5 w-5 text-primary" /> : <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">{n}</span>}
        {title}
      </div>
      {children}
    </li>
  );
}
