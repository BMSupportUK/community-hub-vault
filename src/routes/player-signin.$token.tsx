import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Bot, Loader2, Send, Tv } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import bg from "@/assets/link-device-bg.jpg";

export const Route = createFileRoute("/player-signin/$token")({
  component: PlayerSigninChat,
  head: () => ({ meta: [
    { title: "BM Player sign-in help | BM Support" },
    { name: "description", content: "Private chat to get a BM Player sign-in code." },
    { property: "og:title", content: "BM Player sign-in help | BM Support" },
    { property: "og:description", content: "Private chat to get a BM Player sign-in code." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
    { name: "robots", content: "noindex, nofollow" }, { name: "referrer", content: "no-referrer" },
  ] }),
});

type Msg = { from: "bot" | "me"; text: string; code?: string };
type Res = { dead?: boolean; finished?: boolean; locked?: boolean; stage?: string; code?: string; name?: string; error?: string };
async function call(token: string, step: "start" | "check" | "status", extra?: { number: string; email: string }): Promise<Res> {
  const r = await fetch("/api/public/player-signin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, step, ...extra }) });
  return (await r.json().catch(() => ({ dead: true }))) as Res;
}

function PlayerSigninChat() {
  const { token } = Route.useParams();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [stage, setStage] = useState<"loading" | "number" | "email" | "code" | "dead">("loading");
  const [input, setInput] = useState("");
  const [number, setNumber] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const bot = (text: string, code?: string) => setMsgs((m) => [...m, { from: "bot", text, code }]);
  const me = (text: string) => setMsgs((m) => [...m, { from: "me", text }]);
  const deadText = "This sign-in link has expired or has been used. Open BM Player and scan the new QR code.";

  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);
  useEffect(() => {
    void call(token, "start").then((r) => {
      if (r.dead) { setStage("dead"); bot(deadText); return; }
      bot("Hi 👋 I'm the BM Support sign-in helper. I'll give you a code to sign in to BM Player.");
      bot("First, please type your 6-digit BM Player account number.");
      setStage("number");
    });
  }, [token]);
  // Once the box uses the code this address is switched off; tell the customer.
  useEffect(() => {
    if (stage !== "code") return;
    const t = setInterval(() => void call(token, "status").then((r) => {
      if (r.dead) { setStage("dead"); bot(r.finished ? "You're signed in on BM Player. Enjoy! 🎉 This link has now been switched off." : deadText); }
    }), 5000);
    return () => clearInterval(t);
  }, [stage, token]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (stage === "number") {
      if (!/^\d{6}$/.test(input)) return;
      me(input); setNumber(input); setInput("");
      bot("Thanks. Now type the email address we have for you."); setStage("email"); return;
    }
    const email = input.trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) return;
    me(email); setBusy(true);
    const r = await call(token, "check", { number, email }); setInput(""); setBusy(false);
    if (r.dead) { setStage("dead"); bot(r.locked ? "Too many wrong tries, so this link has been switched off. Please contact BM Support." : deadText); return; }
    if (r.error) { bot(r.error); bot("Please type your 6-digit account number again."); setStage("number"); return; }
    if (r.code) {
      bot(`Thanks ${r.name}, that matches. Here's your sign-in code:`, `${r.code.slice(0, 3)} ${r.code.slice(3)}`);
      bot("Type it into BM Player on your box. It lasts 10 minutes and works once.");
      setStage("code");
    }
  };

  return (
    <main className="relative min-h-dvh overflow-hidden bg-background text-foreground">
      <img src={bg} alt="" aria-hidden width={1920} height={1088} className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-60" />
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-b from-background/80 via-background/50 to-background/90" />
      <div className="relative mx-auto flex h-dvh max-w-xl flex-col px-4 py-6">
        <header className="flex items-center gap-3 rounded-2xl border border-primary/30 bg-background/60 p-4 shadow-2xl backdrop-blur-md">
          <span className="grid size-11 place-items-center rounded-xl bg-primary/25 text-primary"><Tv className="size-6" /></span>
          <div><h1 className="font-display text-lg font-bold">BM Player sign-in</h1><p className="text-xs text-muted-foreground">Private link · works once</p></div>
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
            <div key={i} className="flex justify-end"><div className="max-w-[85%] break-all rounded-2xl rounded-tr-sm bg-primary px-4 py-2.5 text-sm text-primary-foreground">{m.text}</div></div>
          ))}
          <div ref={end} />
        </section>
        <footer className="mt-4">
          {(stage === "number" || stage === "email") && <form onSubmit={submit} className="flex gap-2">
            {stage === "number"
              ? <Input key="n" aria-label="Account number" inputMode="numeric" autoComplete="off" placeholder="6-digit account number" value={input} onChange={(e) => setInput(e.target.value.replace(/\D/g, "").slice(0, 6))} className="h-12 bg-background/70 font-mono text-lg tracking-widest" />
              : <Input key="e" aria-label="Email address" type="email" inputMode="email" autoComplete="email" placeholder="Your email address" value={input} onChange={(e) => setInput(e.target.value.slice(0, 255))} className="h-12 bg-background/70 text-base" />}
            <Button type="submit" size="lg" className="h-12" disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <Send />}</Button>
          </form>}
        </footer>
      </div>
    </main>
  );
}
