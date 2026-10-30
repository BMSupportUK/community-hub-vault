import { useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Link2, Loader2, RefreshCw, Tv } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createDirectInstallLink } from "@/lib/direct-install.functions";

/** BM Direct Install tab: a 30-minute secure Downloader link, then the usual PIN + website code. */
export function DirectInstallSteps({ pin, onChooseDevice }: { pin: ReactNode; onChooseDevice: (d: "amazon" | "android") => void }) {
  const linkFn = useServerFn(createDirectInstallLink);
  const [link, setLink] = useState<{ url: string; expiresAt: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const make = async () => {
    setBusy(true);
    try { setLink(await linkFn()); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't make a download link."); }
    finally { setBusy(false); }
  };
  const shown = link?.url.replace(/^https:\/\//, "");

  return <div className="space-y-6">
    <p className="text-sm text-muted-foreground">BM Direct Install goes straight onto your Fire TV or Android TV and installs your apps there. You don't need a phone or PC, and you don't need to switch on debugging. It only installs apps. For screen sharing with staff, use BM TV Enabler.</p>

    <section className="space-y-3">
      <h3 className="text-lg font-semibold text-foreground">1. Get your secure download link</h3>
      {link ? <div className="space-y-2">
        <p className="select-all break-all font-mono text-3xl font-bold text-primary">{shown}</p>
        <p className="text-xs text-muted-foreground">Only works for you, until {new Date(link.expiresAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })} (30 minutes).</p>
        <Button variant="outline" size="sm" disabled={busy} onClick={make}><RefreshCw className="size-4" />Get a new link</Button>
      </div> : <Button onClick={make} disabled={busy}>{busy ? <Loader2 className="size-4 animate-spin" /> : <Link2 className="size-4" />}Get my secure download link</Button>}
    </section>

    <section className="space-y-2">
      <h3 className="text-lg font-semibold text-foreground">2. Install it with Downloader</h3>
      <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
        <li>Open the <strong className="text-foreground">Downloader</strong> app on your TV. You can get it from the app store.</li>
        <li>Type the link above into the address box and press <strong className="text-foreground">Go</strong>.</li>
        <li>Press <strong className="text-foreground">Install</strong>, then <strong className="text-foreground">Open</strong>. If asked, allow Downloader to install apps.</li>
      </ol>
    </section>

    <section className="space-y-2">
      <h3 className="text-lg font-semibold text-foreground">3. Sign in with your PIN</h3>
      <p className="text-sm text-muted-foreground">Type this PIN into BM Direct Install. It's the same PIN as BM TV Enabler.</p>
      {pin}
    </section>

    <section className="space-y-2">
      <h3 className="text-lg font-semibold text-foreground">4. Choose your apps and get your website code</h3>
      <p className="text-sm text-muted-foreground">Pick your TV, tick your apps and get your website code. Type it into BM Direct Install. When asked, allow it to install apps, then press <strong className="text-foreground">Install</strong> for each app. This page shows All done when it's finished.</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => onChooseDevice("amazon")}><Tv className="size-4" />Amazon Fire TV</Button>
        <Button variant="outline" onClick={() => onChooseDevice("android")}><Tv className="size-4" />Android / Google TV</Button>
      </div>
    </section>
  </div>;
}
