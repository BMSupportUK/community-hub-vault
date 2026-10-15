import { useEffect, useRef, useState, type ReactNode } from "react";
import { MessageCircle, Send, X, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { JobChatMessage } from "@/lib/jobs";
import interview from "@/assets/jobs-interview.jpg";

export type SecureApplicationDetails = {
  full_name: string; email: string; phone: string; experience: string; motivation: string;
  availability: string; status: string; created_at: string; vacancy_title: string;
};

export function JobApplicationSecure({ app, messages, viewer, onSend, header, extra }: {
  app: SecureApplicationDetails; messages: JobChatMessage[]; viewer: "admin" | "applicant";
  onSend: (body: string) => Promise<void>; header?: ReactNode; extra?: ReactNode;
}) {
  return <main className="relative isolate min-h-dvh min-w-0 flex-1">
    <img src={interview} alt="" width={1536} height={1024} className="pointer-events-none absolute inset-0 -z-20 h-full w-full object-cover" />
    <div className="pointer-events-none absolute inset-0 -z-10 bg-background/85" />
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-8">
      {header}
      <div><p className="flex items-center gap-2 text-sm text-primary"><ShieldCheck className="size-4" />Secure application page</p>
        <h1 className="mt-2 break-words font-display text-3xl font-bold">{app.vacancy_title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Applied {new Date(app.created_at).toLocaleString("en-GB", { timeZone: "Europe/London" })} · Status: <span className="capitalize">{app.status}</span></p></div>
      <section className="space-y-5 rounded-lg border border-border bg-card/90 p-5 backdrop-blur-sm sm:p-6">
        <div><h2 className="break-words text-xl font-semibold">{app.full_name}</h2><p className="break-all text-sm text-muted-foreground">{app.email}{app.phone && ` · ${app.phone}`}</p></div>
        {([["experience", "Relevant experience"], ["motivation", "Why they want to join"], ["availability", "Availability"]] as const).map(([k, t]) => <div key={k}><h3 className="mb-1 font-semibold">{t}</h3><p className="whitespace-pre-wrap break-words text-sm">{app[k]}</p></div>)}
      </section>
      {extra}
    </div>
    <ChatBubble messages={messages} viewer={viewer} onSend={onSend} />
  </main>;
}

function ChatBubble({ messages, viewer, onSend }: { messages: JobChatMessage[]; viewer: "admin" | "applicant"; onSend: (b: string) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { if (open) end.current?.scrollIntoView({ block: "end" }); }, [open, messages.length]);
  const otherName = viewer === "admin" ? "Applicant" : "Recruitment team";
  return <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-3">
    {open && <div className="flex h-[min(32rem,75dvh)] w-[min(24rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
      <div className="flex items-center justify-between border-b border-border px-4 py-3"><p className="font-semibold">Chat with {otherName.toLowerCase()}</p><Button size="icon" variant="ghost" aria-label="Close chat" onClick={() => setOpen(false)}><X className="size-4" /></Button></div>
      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {!messages.length && <p className="py-6 text-center text-sm text-muted-foreground">No messages yet. Say hello.</p>}
        {messages.map((m) => { const mine = m.sender === viewer; return <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}><div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${mine ? "bg-primary text-primary-foreground" : "bg-muted"}`}><p className="whitespace-pre-wrap break-words">{m.body}</p><p className="mt-1 text-[10px] opacity-70">{mine ? "You" : otherName} · {new Date(m.created_at).toLocaleString("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p></div></div>; })}
        <div ref={end} />
      </div>
      <form className="flex gap-2 border-t border-border p-3" onSubmit={async (e) => { e.preventDefault(); const b = text.trim(); if (!b) return; setBusy(true); setError(""); try { await onSend(b); setText(""); } catch (err) { setError(err instanceof Error ? err.message : "Message not sent"); } finally { setBusy(false); } }}>
        <Textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={4000} rows={2} placeholder="Type a message…" aria-label="Message" className="min-h-0 resize-none" onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }} />
        <Button type="submit" size="icon" disabled={busy || !text.trim()} aria-label="Send"><Send className="size-4" /></Button>
      </form>
      {error && <p role="alert" className="px-3 pb-2 text-xs text-destructive">{error}</p>}
    </div>}
    <Button size="icon" className="size-14 rounded-full shadow-lg" aria-label={open ? "Close chat" : "Open chat"} onClick={() => setOpen((o) => !o)}><MessageCircle className="size-6" /></Button>
  </div>;
}
