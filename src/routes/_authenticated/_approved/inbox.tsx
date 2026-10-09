import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, Flag, LoaderCircle, MessagesSquare, Pencil, Plus, Search, Send, ShieldCheck, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { inboxAction, isInboxStaff, useBmInbox, type InboxMember, type InboxMessage } from "@/lib/bm-inbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Nameplate } from "@/components/app/Nameplate";
import pubImage from "@/assets/bm-inbox-pub.jpg";
import { InboxPrivacyButton } from "@/components/app/InboxPrivacyButton";
import { getSeason } from "@/lib/seasonal-theme";

export const Route = createFileRoute("/_authenticated/_approved/inbox")({
  head: () => ({ meta: [ { title: "BM Support Inbox" }, { name: "description", content: "Private conversations for BM Support members and staff." }, { property: "og:title", content: "BM Support Inbox" }, { property: "og:description", content: "Private conversations for BM Support members and staff." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" } ] }),
  component: InboxPage,
});

function Identity({ member }: { member?: InboxMember }) {
  return <div className="flex min-w-0 items-center gap-2">
    {member?.avatar ? <img src={member.avatar} alt="" className="size-9 shrink-0 rounded-full object-cover" /> : <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/20 font-semibold text-primary">{member?.name?.slice(0, 1) ?? "M"}</span>}
    <Nameplate id={member?.plate} className="flex h-9 w-[151px] max-w-full items-center rounded-md bg-surface-2 px-2 pr-7 xl:w-[183px]"><span className="relative z-10 truncate text-sm font-semibold">{member?.name ?? "Member"}</span></Nameplate>
  </div>;
}

function InboxPage() {
  const { user, hasAny } = useAuth();
  const [thread, setThread] = useState<string>();
  const { data, enabled, isPending, error } = useBmInbox(thread);
  const cache = useQueryClient();
  const [newOpen, setNewOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState<InboxMessage>();
  const [editBody, setEditBody] = useState("");
  const [report, setReport] = useState<InboxMessage>();
  const [reason, setReason] = useState("");
  const [deleting, setDeleting] = useState<InboxMessage>();
  const bottom = useRef<HTMLDivElement>(null);
  const current = data?.threads.find(t => t.id === thread);
  const member = data?.members.find(m => m.id === current?.other_id);
  const refresh = () => cache.invalidateQueries({ queryKey: ["bm-inbox", user?.id] });
  async function act(action: Parameters<typeof inboxAction>[0], target: string, body = "") {
    setBusy(true);
    try { const id = await inboxAction(action, target, body); await refresh(); return id; }
    catch (e) { toast.error(/not accepting messages/i.test(String((e as { message?: string })?.message ?? e)) ? "This person isn't accepting inbox messages." : "Could not complete that action. Please try again."); return null; }
    finally { setBusy(false); }
  }
  // Hide the pub background while a seasonal theme (Halloween/Christmas) is active.
  const [season, setSeason] = useState<ReturnType<typeof getSeason>>(null);
  useEffect(() => {
    setSeason(getSeason());
    const id = window.setInterval(() => setSeason(getSeason()), 60 * 60 * 1000);
    return () => window.clearInterval(id);
  }, []);
  useEffect(() => {
    if (!thread) return;
    void inboxAction("read", thread).then(refresh).catch(() => {});
  }, [thread, data?.messages.at(-1)?.id]);
  useEffect(() => { bottom.current?.scrollIntoView({ block: "nearest" }); }, [thread, data?.messages.length]);
  if (!enabled) return <div className="p-8"><h1 className="font-display text-2xl">BM Support Inbox</h1><p className="mt-3 text-muted-foreground">Your account does not have inbox access.</p></div>;
  return <section className="relative isolate flex min-h-[calc(100dvh-180px)] w-full min-w-0 flex-col overflow-hidden">
    {!season && <img src={pubImage} alt="" className="pointer-events-none absolute inset-0 -z-20 size-full object-cover" />}
    <div className="pointer-events-none absolute inset-0 -z-10 bg-background/65" />
    <header className="flex items-center justify-between gap-3 border-b border-border bg-background/80 px-4 py-4 backdrop-blur-sm md:px-6"><h1 className="flex items-center gap-3 font-display text-2xl font-bold"><MessagesSquare className="size-6 text-primary" />BM Support Inbox</h1><div className="flex gap-2"><InboxPrivacyButton />{hasAny(["admin", "management"]) && <Button variant="outline" size="icon" asChild><Link to="/inbox-reports" title="Inbox reports" aria-label="Inbox reports"><ShieldCheck className="size-4" /></Link></Button>}<Button size="icon" title="New message" aria-label="New message" onClick={() => { setSearch(""); setNewOpen(true); }}><Plus className="size-5" /></Button></div></header>
    <div className="grid min-h-0 flex-1 md:grid-cols-[300px_minmax(0,1fr)]">
      <aside className={`${thread ? "hidden md:flex" : "flex"} min-h-0 flex-col border-r border-border bg-background/85 backdrop-blur-sm`}><div className="relative m-4"><Search className="absolute left-3 top-3 size-4 text-muted-foreground" /><Input aria-label="Search conversations" placeholder="Search conversations" value={search} onChange={e => setSearch(e.target.value)} className="pl-9" /></div>
        <div className="max-h-[65dvh] overflow-y-auto">{isPending ? <p className="p-5 text-muted-foreground">Loading inbox…</p> : error ? <p className="p-5 text-destructive">Inbox unavailable. Please try again.</p> : data?.threads.length === 0 ? <p className="p-5 text-muted-foreground">No conversations yet.</p> : data?.threads.filter(t => (data.members.find(m => m.id === t.other_id)?.name ?? "").toLowerCase().includes(search.toLowerCase())).map(t => { const other = data.members.find(m => m.id === t.other_id); return <Button key={t.id} variant="ghost" onClick={() => { setThread(t.id); setDraft(""); }} className={`h-auto w-full justify-start rounded-none border-b border-border px-4 py-4 text-left ${thread === t.id ? "bg-primary/15" : ""}`}><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><span className="truncate font-semibold">{other?.name ?? "Member"}</span>{t.unread > 0 && <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">{t.unread}</span>}</div><p className="mt-1 truncate text-xs text-muted-foreground">{t.last_body ?? "New conversation"}</p></div></Button>; })}</div>
      </aside>
      <main className={`${thread ? "flex" : "hidden md:flex"} min-w-0 flex-col`}>
        {!thread ? <div className="flex flex-1 flex-col items-center justify-center gap-5 p-8"><MessagesSquare className="size-16 text-primary" /><h2 className="font-display text-xl font-semibold">Your conversations</h2><Button onClick={() => { setSearch(""); setNewOpen(true); }}><Plus className="mr-2 size-4" />New message</Button></div> : <>
          <div className="flex items-center gap-3 border-b border-border bg-background/85 p-4"><Button variant="ghost" size="icon" className="md:hidden" onClick={() => setThread(undefined)} aria-label="Back to conversations"><ArrowLeft className="size-4" /></Button><Identity member={member} /></div>
          <div className="flex h-[52dvh] min-h-[280px] flex-col gap-5 overflow-y-auto p-4 md:p-6" aria-label="Conversation messages">{data?.messages.length === 0 && <p className="m-auto text-muted-foreground">No messages yet.</p>}{data?.messages.map(message => { const own = message.sender_id === user?.id; return <article key={message.id} className={`flex max-w-[90%] flex-col gap-2 ${own ? "self-end" : "self-start"}`}><Identity member={data.members.find(m => m.id === message.sender_id)} /><div className={`rounded-lg px-4 py-3 ${own ? "bg-primary text-primary-foreground" : "border border-border bg-background/95 text-foreground"}`}><p className="whitespace-pre-wrap break-words text-sm">{message.deleted_at ? "Message deleted" : message.body}</p></div><div className="flex items-center gap-1 rounded-md bg-background/85 px-2 text-xs text-muted-foreground"><time>{new Date(message.created_at).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}</time>{message.edited_at && !message.deleted_at && <span>· edited</span>}{!message.deleted_at && (own ? <><Button size="icon" variant="ghost" className="size-7" aria-label="Edit message" title="Edit message" onClick={() => { setEdit(message); setEditBody(message.body); }}><Pencil className="size-3" /></Button><Button size="icon" variant="ghost" className="size-7" aria-label="Delete message" title="Delete message" onClick={() => setDeleting(message)}><Trash2 className="size-3" /></Button></> : <Button size="icon" variant="ghost" className="size-7" aria-label="Report message" title="Report message" onClick={() => { setReport(message); setReason(""); }}><Flag className="size-3" /></Button>)}</div></article>; })}<div ref={bottom} /></div>
          <form className="mt-auto flex items-end gap-3 border-t border-border bg-background/90 p-4" onSubmit={async e => { e.preventDefault(); if (!draft.trim() || busy) return; if (await act("send", thread, draft)) setDraft(""); }}><Textarea aria-label="Message" placeholder="Write a message…" maxLength={4000} value={draft} onChange={e => setDraft(e.target.value)} className="min-h-20 flex-1 resize-none" /><Button size="icon" type="submit" aria-label="Send message" title="Send message" disabled={busy || !draft.trim()}>{busy ? <LoaderCircle className="size-4 animate-spin" /> : <Send className="size-4" />}</Button></form>
        </>}
      </main>
    </div>
    <Dialog open={newOpen} onOpenChange={setNewOpen}><DialogContent className="max-h-[85dvh] overflow-y-auto"><DialogHeader><DialogTitle>New message</DialogTitle></DialogHeader><Input aria-label="Find a member" placeholder="Find a member" value={search} onChange={e => setSearch(e.target.value)} /><div className="max-h-[50dvh] space-y-2 overflow-y-auto">{([["Staff", true], ["Members", false]] as const).map(([label, staff]) => { const list = (data?.members ?? []).filter(m => m.id !== user?.id && isInboxStaff(m) === staff && `${m.name} ${m.username ?? ""}`.toLowerCase().includes(search.toLowerCase())); if (list.length === 0) return null; return <div key={label}><p className="px-1 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>{list.map(m => <Button key={m.id} variant="ghost" className="h-auto w-full justify-start py-3" disabled={busy} onClick={async () => { const id = await act("start", m.id); if (id) { setThread(id); setNewOpen(false); setSearch(""); setDraft(""); } }}><Identity member={m} /></Button>)}</div>; })}</div></DialogContent></Dialog>
    <Dialog open={!!edit} onOpenChange={open => { if (!open) setEdit(undefined); }}><DialogContent><DialogHeader><DialogTitle>Edit message</DialogTitle></DialogHeader><Textarea aria-label="Edit message text" maxLength={4000} value={editBody} onChange={e => setEditBody(e.target.value)} /><DialogFooter><Button disabled={busy || !editBody.trim()} onClick={async () => { if (edit && await act("edit", edit.id, editBody)) setEdit(undefined); }}><Check className="mr-2 size-4" />Save</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={!!deleting} onOpenChange={open => { if (!open) setDeleting(undefined); }}><DialogContent><DialogHeader><DialogTitle>Delete this message?</DialogTitle></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setDeleting(undefined)}><X className="mr-2 size-4" />Cancel</Button><Button variant="destructive" disabled={busy} onClick={async () => { if (deleting && await act("delete", deleting.id)) setDeleting(undefined); }}><Trash2 className="mr-2 size-4" />Delete</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={!!report} onOpenChange={open => { if (!open) setReport(undefined); }}><DialogContent><DialogHeader><DialogTitle>Report to admin and management</DialogTitle></DialogHeader><Textarea aria-label="Report reason" placeholder="Reason for reporting" maxLength={1000} value={reason} onChange={e => setReason(e.target.value)} /><DialogFooter><Button disabled={busy || reason.trim().length < 3} onClick={async () => { if (report && await act("report", report.id, reason)) { setReport(undefined); toast.success("Report sent to admin and management."); } }}><Flag className="mr-2 size-4" />Send report</Button></DialogFooter></DialogContent></Dialog>
  </section>;
}