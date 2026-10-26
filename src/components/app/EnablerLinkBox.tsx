import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Button } from "@/components/ui/button";
import { readSetupCode, writeSetupCode } from "@/lib/setup-code-store";

/** Phone deep link the BM TV Enabler app opens from a camera scan. */
export const enablerLinkUrl = (code: string) => `bmtvenabler://link?code=${code}`;

/** QR that links BM TV Enabler to this ticket/order, so the app sends its TV checks and code here by itself. */
export function EnablerLinkBox({ storeKey, issue, disabled }: { storeKey: string; issue: () => Promise<string>; disabled?: boolean }) {
  const [code, setCode] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setCode(readSetupCode(storeKey)); }, [storeKey]);
  useEffect(() => { if (code) QRCode.toDataURL(enablerLinkUrl(code), { width: 360, margin: 1 }).then(setQr).catch(() => setQr(null)); else setQr(null); }, [code]);
  const make = async () => {
    setBusy(true);
    try { const c = await issue(); writeSetupCode(storeKey, c); setCode(c); } finally { setBusy(false); }
  };
  return <div className="space-y-3 rounded-xl border border-primary/40 bg-primary/10 p-4">
    <h3 className="font-semibold">Link BM TV Enabler — no typing</h3>
    <p className="text-sm">Scan this with your Android phone's camera after installing BM TV Enabler. The app then sends your TV checks and TV code straight here, and a Connect button appears.</p>
    {code ? <>
      {qr && <img src={qr} alt="QR code that links BM TV Enabler to this page" width={200} height={200} className="mx-auto rounded-md bg-card p-2" />}
      <p className="text-center text-xs text-muted-foreground">Windows app: type link code <span className="font-mono text-sm font-semibold text-foreground">{code}</span> in BM TV Enabler. Lasts 2 hours.</p>
      <Button size="sm" variant="ghost" className="w-full" disabled={busy || disabled} onClick={() => void make()}>New link code</Button>
    </> : <Button className="w-full" disabled={busy || disabled} onClick={() => void make()}>Show my link QR</Button>}
  </div>;
}
