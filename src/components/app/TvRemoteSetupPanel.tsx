import { useEffect, useState } from "react";
import { registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import { CheckCircle2, Loader2, Tv } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { remoteHelperAvailable } from "@/lib/remote-helper";

type TvRemoteSetupPlugin = {
  enable(o: { host: string }): Promise<{ ok: boolean; checks?: { adb: boolean; helper: boolean; control: boolean; accessibility: boolean } }>;
  addListener(e: "progress", cb: (d: { step: string }) => void): Promise<PluginListenerHandle>;
};
const TvRemoteSetup = registerPlugin<TvRemoteSetupPlugin>("TvRemoteSetup");

export function isTvAddress(v: string): boolean {
  return /^(\d{1,3})(\.\d{1,3}){3}$/.test(v.trim()) && v.trim().split(".").every((p) => Number(p) <= 255);
}

export function TvRemoteSetupPanel() {
  const [native, setNative] = useState(false);
  const [host, setHost] = useState("");
  const [setupCode, setSetupCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => { setNative(remoteHelperAvailable()); setHost(localStorage.getItem("bm-tv-address") ?? ""); }, []);

  async function run() {
    setBusy(true); setError(null); setDone(false);
    setStep("Connecting to your TV… a box saying \"Allow debugging?\" will appear on the TV. Tick Always allow, then press Allow.");
    localStorage.setItem("bm-tv-address", host.trim());
    const sub = await TvRemoteSetup.addListener("progress", (d) => setStep(d.step));
    try {
      const res = await TvRemoteSetup.enable({ host: host.trim() });
      const sc = setupCode.replace(/\D/g, "");
      if (sc.length === 8 && res.checks) {
        setStep("Telling BM Support your TV is ready…");
        const r = await fetch("https://bmsupport.uk/api/public/remote-setup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: sc, app: "bm-support-phone", checks: res.checks }) });
        if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't tell BM Support. Try again.");
      }
      setDone(true); setStep(null);
    }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); setStep(null); }
    finally { void sub.remove(); setBusy(false); }
  }

  return (
    <section className="max-w-xl space-y-4 rounded-xl border border-border bg-surface-1 p-4">
      <h2 className="flex items-center gap-2 font-display text-sm font-semibold"><Tv className="size-4" />Turn on TV remote control</h2>
      <p className="text-sm text-muted-foreground">
        Amazon Fire TV won't let BM Support's remote control switch itself on. Your Android phone can do it in one go.
      </p>
      <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
        <li>Put your phone on the same Wi-Fi as the TV.</li>
        <li>On the TV: Settings › My Fire TV › Developer options › ADB debugging ON.</li>
        <li>Open BM Remote Helper on the TV. It shows the TV's address (like 192.168.1.23).</li>
        <li>Type that address below and press Turn on.</li>
      </ol>
      {native ? (
        <div className="space-y-3">
          <Input inputMode="numeric" placeholder="Setup code from your support ticket (8 digits)" value={setupCode} onChange={(e) => setSetupCode(e.target.value.replace(/\D/g, "").slice(0, 8))} disabled={busy} />
          <Input inputMode="decimal" placeholder="TV address, e.g. 192.168.1.23" value={host} onChange={(e) => setHost(e.target.value)} disabled={busy} />
          <div className="flex flex-wrap gap-2">
            <Button onClick={run} disabled={busy || !isTvAddress(host)}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Tv className="size-4" />}Turn on
            </Button>
          </div>
          {step && <p className="text-sm font-medium text-primary">{step}</p>}
          {error && <p className="text-sm text-destructive">{error}</p>}
          {done && <p className="flex items-center gap-2 text-sm font-medium text-primary"><CheckCircle2 className="size-4" />Remote control is on. Open BM Remote Helper on the TV to get your code.</p>}
          <p className="text-xs text-muted-foreground">You only need to do this once — the TV keeps these settings when it is switched off. If it can't connect later, open BM Remote Helper on the TV and check its address: the router may have given it a new one.</p>
        </div>
      ) : (
        <p className="rounded-lg border border-border bg-background p-3 text-sm">
          This only works inside the BM Support app on an Android phone. iPhone can't do it. Without it, staff can still see your TV screen and talk you through it.
        </p>
      )}
    </section>
  );
}
