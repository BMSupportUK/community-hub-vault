import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Bot, Loader2, Send, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import bg from "@/assets/link-device-bg.jpg";

export const Route = createFileRoute("/2fa-help/$token")({
  component: TwoFaHelpChat,
  head: () => ({ meta: [
    { title: "BM Player 2FA help | BM Support" },
    { name: "description", content: "Private help chat to reset BM Player two-factor authentication." },
    { property: "og:title", content: "BM Player 2FA help | BM Support" },
    { property: "og:description", content: "Private help chat to reset BM Player two-factor authentication." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
    { name: "robots", content: "noindex, nofollow" }, { name: "referrer", content: "no-referrer" },
  ] }),
});

type Msg = { from: "bot" | "me"; text: string; code?: string };
type Stage = "loading" | "number" | "code" | "confirm" | "dead";

async function call(token: string, step: "start" | "number" | "done", number?: string) {
  const r = await fetch("/api/public/2fa-help", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, step, number }) });
  return (await r.json().catch(() => ({ dead: true }))) as { dead?: boolean; finished?: boolean; locked?: boolean; name?: string; stage?: string; code?: string; error?: string };
}

function TwoFaHelpChat() {
  const { token } = Route.useParams();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [stage, setStage] = useState<Stage>("loading");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const bot = (text: string, code?: string) => setMsgs((m) => [...m, { from: "bot", text, code }]);

  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);
  useEffect(() => {
    void call(token, "start").then((r) => {
      if (r.dead) { setStage("dead"); bot("This help link has expired or has already been used. Open BM Player and ask for a new one from the 2FA screen."); return; }
      bot(`Hi ${r.name} 👋 I'm the BM Support 2FA helper. I'll give you a code to reset 2FA on your BM Player box.`);
      if (r.stage === "reset") { bot("Your 2FA has been reset. Have you scanned the new QR code and are you back up and running?"); setStage("confirm"); }
      else { bot("First, please type your 6-digit BM Player account number."); setStage("number"); }
    });
  }, [token]);

  const sendNumber = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(input)) return;
    setMsgs((m) => [...m, { from: "me", text: input }]); setBusy(true);
    const r = await call(token, "number", input); setInput(""); setBusy(false);
    if (r.dead) { setStage("dead"); bot(r.locked ? "Too many wrong account numbers, so this link has been switched off. Please contact BM Support." : "This help link has expired."); return; }
    if (r.stage === "reset") { bot("Your 2FA has already been reset. Are you back up and running?"); setStage("confirm"); return; }
    if (r.error) { bot(r.error); return; }
    if (r.code) {
      bot("Thanks, that matches. Here's your reset code:", r.code);
      bot("On your box, choose \"Can't use my authenticator? Use a backup code\" and type this code. Your box will then show a new QR code — scan it with your authenticator app and type the 6-digit code it shows.");
      bot("Once you've done that, let me know you're back up and running.");
      setStage("confirm");
    }
  };

  const finish = async () => {
    setMsgs((m) => [...m, { from: "me", text: "Yes, I'm back up and running" }]); setBusy(true);
    await call(token, "done"); setBusy(false); setStage("dead");
    bot("Brilliant, enjoy! 🎉 This help link has now been switched off for your safety.");
  };

  return (
    <main className="relative min-h-dvh overflow-hidden bg-background text-foreground">
      <img src={bg} alt="" aria-hidden width={1920} height={1088} className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-60" />
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-b from-background/80 via-background/50 to-background/90" />
      <div className="relative mx-auto flex h-dvh max-w-xl flex-col px-4 py-6">
        <header className="flex items-center gap-3 rounded-2xl border border-primary/30 bg-background/60 p-4 shadow-2xl backdrop-blur-md">
          <span className="grid size-11 place-items-center rounded-xl bg-primary/25 text-primary"><ShieldCheck className="size-6" /></span>
          <div><h1 className="font-display text-lg font-bold">BM Player 2FA help</h1><p className="text-xs text-muted-foreground">Private link · works once</p></div>
        </header>
        <section className="mt-4 flex-1 space-y-3 overflow-y-auto rounded-2xl border border-primary/20 bg-background/50 p-4 backdrop-blur-md" aria-live="polite">
          {stage === "loading" && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Opening chat…</p>}
          {msgs.map((m, i) => m.from === "bot" ? (
            <div key={i} className="flex items-start gap-2">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/25 text-primary"><Bot className="size-4" /></span>
              <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-surface/90 px-4 py-2.5 text-sm">
                {m.text}
                {m.code && <div className="mt-2 rounded-lg border border-primary/50 bg-primary/15 px-4 py-3 text-center font-mono text-3xl font-bold tracking-[0.2em]">{m.code}</div>}
              </div>
            </div>
          ) : (
            <div key={i} className="flex justify-end"><div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-primary px-4 py-2.5 text-sm text-primary-foreground">{m.text}</div></div>
          ))}
          <div ref={end} />
        </section>
        <footer className="mt-4">
          {stage === "number" && <form onSubmit={sendNumber} className="flex gap-2">
            <Input aria-label="Account number" inputMode="numeric" autoComplete="off" placeholder="6-digit account number" value={input} onChange={(e) => setInput(e.target.value.replace(/\D/g, "").slice(0, 6))} className="h-12 bg-background/70 font-mono text-lg tracking-widest" />
            <Button type="submit" size="lg" className="h-12" disabled={busy || input.length !== 6}>{busy ? <Loader2 className="animate-spin" /> : <Send />}</Button>
          </form>}
          {stage === "confirm" && <Button size="lg" className="h-12 w-full" disabled={busy} onClick={() => void finish()}>Yes, I'm back up and running</Button>}
        </footer>
      </div>
    </main>
  );
}
