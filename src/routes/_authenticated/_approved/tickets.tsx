import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { ChannelColumn, type ChannelGroup } from "@/components/app/ChannelColumn";
import {
  Ticket as TicketIcon, Plus, Send, Lock, X, LifeBuoy, CreditCard, Bug, Sparkles, UserCog,
  Tv, Film, Circle, CircleDot, Clock4, CheckCircle2, XCircle, ChevronDown, Trash2, Coffee, UtensilsCrossed,
  Paperclip, FileText,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { MentionText, useMentionAutocomplete } from "@/components/app/mentions";

export const Route = createFileRoute("/_authenticated/_approved/tickets")({
  validateSearch: (s: Record<string, unknown>) => ({
    id: typeof s.id === "string" ? s.id : undefined,
    view: (s.view === "mine" || s.view === "all" || s.view === "assigned") ? s.view : undefined,
  }),
  component: TicketsPage,
});

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  LifeBuoy, CreditCard, Bug, Sparkles, UserCog, Tv, Film,
};

const STATUS_META = {
  open:        { label: "Open",        Icon: CircleDot,    cls: "text-primary" },
  in_progress: { label: "In progress", Icon: Clock4,       cls: "text-warning" },
  waiting:     { label: "Waiting",     Icon: Circle,       cls: "text-muted-foreground" },
  resolved:    { label: "Resolved",    Icon: CheckCircle2, cls: "text-success" },
  closed:      { label: "Closed",      Icon: XCircle,      cls: "text-muted-foreground" },
} as const;
type Status = keyof typeof STATUS_META;

const PRIORITIES = ["low", "normal", "high", "urgent"] as const;
type Priority = typeof PRIORITIES[number];
const PRI_CLS: Record<Priority, string> = {
  low: "bg-muted text-muted-foreground",
  normal: "bg-surface-2 text-foreground",
  high: "bg-warning/15 text-warning",
  urgent: "bg-destructive/15 text-destructive",
};

interface Category { id: string; name: string; slug: string; description: string | null; icon: string; color: string; sort_order: number; }
interface Ticket {
  id: string; user_id: string; category_id: string; subject: string;
  status: Status; priority: Priority; assigned_to: string | null;
  created_at: string; updated_at: string;
}
interface Message { id: string; ticket_id: string; sender_id: string; content: string; is_internal: boolean; created_at: string; attachments?: Attachment[]; }
interface Attachment { name: string; path: string; size: number; type: string; }
interface Profile { id: string; display_name: string | null; username: string | null; }

const newTicketSchema = z.object({
  subject: z.string().trim().min(3, "Subject must be at least 3 characters").max(120),
  category_id: z.string().uuid("Pick a category"),
  priority: z.enum(PRIORITIES),
  message: z.string().trim().max(2000),
});

async function uploadTicketFiles(files: File[]): Promise<Attachment[]> {
  const out: Attachment[] = [];
  for (const f of files) {
    if (f.size > 25 * 1024 * 1024) {
      toast.error(`${f.name} is over 25MB`);
      continue;
    }
    const safe = f.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}`;
    const { error } = await supabase.storage.from("ticket-attachments").upload(path, f, {
      cacheControl: "3600",
      upsert: false,
      contentType: f.type || undefined,
    });
    if (error) {
      toast.error(`Upload failed: ${error.message}`);
      continue;
    }
    out.push({ name: f.name, path, size: f.size, type: f.type });
  }
  return out;
}

function TicketAttachment({ item }: { item: Attachment }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    supabase.storage
      .from("ticket-attachments")
      .createSignedUrl(item.path, 60 * 60)
      .then(({ data }) => { if (active) setUrl(data?.signedUrl ?? null); });
    return () => { active = false; };
  }, [item.path]);
  const isImg = item.type?.startsWith("image/");
  if (isImg) {
    return url ? (
      <a href={url} target="_blank" rel="noreferrer" className="block">
        <img src={url} alt={item.name} className="size-24 rounded-lg object-cover border border-white/30 hover:opacity-80" />
      </a>
    ) : <div className="size-24 rounded-lg bg-white/10 animate-pulse" />;
  }
  return (
    <a
      href={url ?? "#"}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => { if (!url) e.preventDefault(); }}
      className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-white/30 bg-white/10 text-xs hover:bg-white/20"
    >
      <FileText className="size-3.5" />
      <span className="max-w-[180px] truncate">{item.name}</span>
    </a>
  );
}

function TicketAttachments({ items }: { items: Attachment[] | null | undefined }) {
  if (!items?.length) return null;
  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {items.map((a, i) => <TicketAttachment key={i} item={a} />)}
    </div>
  );
}

function FilePicker({
  files, setFiles, disabled, dark,
}: { files: File[]; setFiles: (f: File[]) => void; disabled?: boolean; dark?: boolean }) {
  const base = dark
    ? "border-white/30 bg-white/10 hover:bg-white/20 text-white"
    : "border-border bg-surface-2 hover:border-primary";
  return (
    <div className="space-y-1.5">
      <label className={cn("inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs cursor-pointer", base)}>
        <Paperclip className="size-3.5" />
        <span>Attach files</span>
        <input
          type="file" multiple className="hidden" disabled={disabled}
          onChange={(e) => {
            const list = Array.from(e.target.files ?? []);
            setFiles([...files, ...list]);
            e.target.value = "";
          }}
        />
      </label>
      {files.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {files.map((f, i) => (
            <span key={i} className={cn("inline-flex items-center gap-1.5 px-2 py-0.5 rounded border text-[11px]", base)}>
              <span className="max-w-[160px] truncate">{f.name}</span>
              <button type="button" onClick={() => setFiles(files.filter((_, j) => j !== i))} className="opacity-70 hover:opacity-100">
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function TicketsPage() {
  const { user, isStaff } = useAuth();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const view = search.view ?? (isStaff ? "all" : "mine");

  const [categories, setCategories] = useState<Category[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [profiles, setProfiles] = useState<Map<string, Profile>>(new Map());
  const [staff, setStaff] = useState<Profile[]>([]);
  const [creating, setCreating] = useState(false);

  // Load categories once
  useEffect(() => {
    supabase.from("ticket_categories").select("*").order("sort_order").then(({ data }) => setCategories(data ?? []));
  }, []);

  // Load tickets according to view
  const loadTickets = async () => {
    let q = supabase.from("tickets").select("*").order("updated_at", { ascending: false });
    if (view === "mine") q = q.eq("user_id", user!.id);
    else if (view === "assigned") q = q.eq("assigned_to", user!.id);
    const { data } = await q;
    setTickets((data ?? []) as Ticket[]);
    const ids = new Set<string>();
    (data ?? []).forEach((t) => { ids.add(t.user_id); if (t.assigned_to) ids.add(t.assigned_to); });
    if (ids.size) {
      const { data: profs } = await supabase.from("profiles").select("id, display_name, username").in("id", [...ids]);
      const m = new Map(profiles);
      (profs ?? []).forEach((p) => m.set(p.id, p));
      setProfiles(m);
    }
  };

  useEffect(() => {
    if (!user) return;
    loadTickets();
    const ch = supabase
      .channel("tickets-list")
      .on("postgres_changes", { event: "*", schema: "public", table: "tickets" }, () => loadTickets())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, view]);

  // Load assignable staff list (once, for staff users)
  useEffect(() => {
    if (!isStaff) return;
    (async () => {
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id")
        .in("role", ["admin", "management", "staff", "moderator"]);
      const ids = [...new Set((roles ?? []).map((r) => r.user_id))];
      if (!ids.length) return;
      const { data: profs } = await supabase.from("profiles").select("id, display_name, username").in("id", ids);
      setStaff(profs ?? []);
    })();
  }, [isStaff]);

  const selected = useMemo(() => tickets.find((t) => t.id === search.id) ?? null, [tickets, search.id]);

  const groups: ChannelGroup[] = useMemo(() => {
    const buckets: Record<Status, Ticket[]> = { open: [], in_progress: [], waiting: [], resolved: [], closed: [] };
    tickets.forEach((t) => buckets[t.status].push(t));
    return (Object.keys(STATUS_META) as Status[])
      .filter((s) => buckets[s].length)
      .map((s) => ({
        label: STATUS_META[s].label,
        items: buckets[s].map((t) => ({ to: `/tickets`, label: t.subject })),
      }));
  }, [tickets]);

  const setView = (v: "mine" | "all" | "assigned") =>
    navigate({ to: "/tickets", search: { view: v, id: undefined } });

  return (
    <>
      <ChannelColumn
        title="Tickets"
        groups={[]}
        footer={
          <div className="space-y-3 mt-2">
            <button
              onClick={() => setCreating(true)}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              <Plus className="size-4" /> New ticket
            </button>
            {isStaff && (
              <div className="flex gap-1 bg-surface-2 p-1 rounded-lg text-xs">
                {(["mine", "assigned", "all"] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => setView(v)}
                    className={cn(
                      "flex-1 px-2 py-1 rounded-md capitalize transition-colors",
                      view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                    )}
                  >{v}</button>
                ))}
              </div>
            )}
            <div className="space-y-3">
              {groups.length === 0 && (
                <div className="text-xs text-muted-foreground px-2 py-3 text-center">No tickets yet.</div>
              )}
              {groups.map((g) => (
                <div key={g.label}>
                  <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                    <ChevronDown className="size-3" />{g.label}
                  </div>
                  <div className="space-y-px">
                    {tickets.filter((t) => STATUS_META[t.status].label === g.label).map((t) => {
                      const cat = categories.find((c) => c.id === t.category_id);
                      const Icon = ICONS[cat?.icon ?? "LifeBuoy"] ?? LifeBuoy;
                      const active = selected?.id === t.id;
                      return (
                        <button
                          key={t.id}
                          onClick={() => navigate({ to: "/tickets", search: { id: t.id, view } })}
                          className={cn(
                            "w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors",
                            active ? "bg-surface-2 text-foreground" : "text-muted-foreground hover:bg-surface-2/60 hover:text-foreground",
                          )}
                        >
                          <Icon className="size-4 shrink-0" />
                          <span className="truncate flex-1">{t.subject}</span>
                          {t.priority === "urgent" && <span className="size-1.5 rounded-full bg-destructive" />}
                          {t.priority === "high" && <span className="size-1.5 rounded-full bg-warning" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        }
      />
      <main className="flex-1 flex flex-col min-w-0 bg-gradient-to-br from-violet-600 via-fuchsia-600 to-blue-600 text-white relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 opacity-60" style={{
          background:
            "radial-gradient(800px 400px at 0% 0%, rgba(244,63,94,0.55), transparent 60%), radial-gradient(700px 400px at 100% 0%, rgba(168,85,247,0.45), transparent 60%), radial-gradient(900px 500px at 50% 100%, rgba(250,204,21,0.45), transparent 60%)",
        }} />
        <div className="relative flex-1 flex flex-col min-h-0">
        <StaffOnDutyStrip />
        {creating ? (
          <NewTicketForm
            categories={categories}
            onCancel={() => setCreating(false)}
            onCreated={(id) => { setCreating(false); navigate({ to: "/tickets", search: { id, view } }); }}
          />
        ) : selected ? (
          <TicketDetail
            ticket={selected}
            categories={categories}
            profiles={profiles}
            staff={staff}
            isStaff={isStaff}
            currentUserId={user!.id}
          />
        ) : (
          <div className="flex-1 grid place-items-center">
            <div className="text-center max-w-sm">
              <div className="size-14 rounded-2xl bg-white/20 backdrop-blur grid place-items-center mx-auto mb-4 shadow-lg">
                <TicketIcon className="size-6 text-white" />
              </div>
              <h1 className="font-display text-xl font-bold text-white drop-shadow">Support tickets</h1>
              <p className="text-white/85 text-sm mt-2">
                {tickets.length === 0 ? "Open your first ticket to get help from the team." : "Select a ticket from the list."}
              </p>
              <button
                onClick={() => setCreating(true)}
                className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white text-rose-600 text-sm font-semibold hover:bg-white/90 shadow-lg"
              >
                <Plus className="size-4" /> New ticket
              </button>
            </div>
          </div>
        )}
        </div>
      </main>
    </>
  );
}

function NewTicketForm({
  categories, onCancel, onCreated,
}: { categories: Category[]; onCancel: () => void; onCreated: (id: string) => void }) {
  const { user } = useAuth();
  const [subject, setSubject] = useState("");
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [priority, setPriority] = useState<Priority>("normal");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [files, setFiles] = useState<File[]>([]);

  useEffect(() => { if (!categoryId && categories[0]) setCategoryId(categories[0].id); }, [categories, categoryId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = newTicketSchema.safeParse({ subject, category_id: categoryId, priority, message });
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    if (!parsed.data.message && files.length === 0) return toast.error("Add a message or attach a file");
    setSubmitting(true);
    const uploaded = files.length ? await uploadTicketFiles(files) : [];
    const { data: t, error } = await supabase
      .from("tickets")
      .insert({ user_id: user!.id, subject: parsed.data.subject, category_id: parsed.data.category_id, priority: parsed.data.priority })
      .select("id").single();
    if (error || !t) { setSubmitting(false); return toast.error(error?.message ?? "Failed"); }
    const { error: e2 } = await supabase.from("ticket_messages").insert({
      ticket_id: t.id, sender_id: user!.id, content: parsed.data.message, is_internal: false,
      attachments: uploaded as unknown as never,
    });
    setSubmitting(false);
    if (e2) return toast.error(e2.message);

    const cat = categories.find((c) => c.id === parsed.data.category_id);
    if (cat?.slug === "account") {
      await supabase.from("ticket_messages").insert({
        ticket_id: t.id,
        sender_id: user!.id,
        content:
          "👋 Welcome to BM Support!\n\nFor account-related questions, your app login details and DNS codes are available on your profile page. Open your avatar menu and go to **Profile → Credentials & DNS**, then enter your account password and vault PIN to reveal them.\n\nIf you still need help after checking, reply here and a staff member will get back to you.",
        is_internal: false,
      });
    }

    if (cat?.slug === "live-tv") {
      await supabase.from("ticket_messages").insert({
        ticket_id: t.id,
        sender_id: user!.id,
        content:
          "👋 Welcome to BM Support!\n\nThanks for reporting a Live TV issue. To help our staff look into this as quickly as possible, please reply with the following details:\n\n1. **Channel name:**\n2. **Category name:**\n3. **Issue:**\n\nThese details are needed so staff can investigate and get the issue resolved for you.",
        is_internal: false,
      });
    }

    if (cat?.slug === "movies-series") {
      await supabase.from("ticket_messages").insert({
        ticket_id: t.id,
        sender_id: user!.id,
        content:
          "👋 Welcome to BM Support!\n\nThanks for reporting a Movie/Series issue. To help our staff look into this as quickly as possible, please reply with the following details:\n\n1. **Movie or Series:**\n2. **Name of Movie/Series:**\n3. **Issue:**\n\nThese details are needed so staff can investigate and get the issue resolved for you.",
        is_internal: false,
      });
    }

    toast.success("Ticket opened");
    onCreated(t.id);
  };

  return (
    <>
      <header className="h-14 border-b border-border px-5 flex items-center gap-2">
        <Plus className="size-4 text-white" />
        <h1 className="font-display font-semibold text-white">New ticket</h1>
        <button onClick={onCancel} className="ml-auto text-white/70 hover:text-white"><X className="size-4" /></button>
      </header>
      <form onSubmit={submit} className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl mx-auto space-y-5">
          <Field label="Subject">
            <input
              value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={120}
              placeholder="Briefly describe the issue"
              className="w-full px-3 py-2 rounded-lg bg-white/15 backdrop-blur border border-white/30 focus:border-white text-white placeholder:text-white/60 outline-none"
            />
          </Field>
          <Field label="Category">
            <div className="grid sm:grid-cols-2 gap-2">
              {categories.map((c) => {
                const Icon = ICONS[c.icon] ?? LifeBuoy;
                const active = c.id === categoryId;
                return (
                  <button
                    type="button" key={c.id} onClick={() => setCategoryId(c.id)}
                    className={cn(
                      "flex items-start gap-3 p-3 rounded-lg border text-left transition-colors",
                      active ? "border-white bg-white/25" : "border-white/30 bg-white/10 hover:bg-white/20",
                    )}
                  >
                    <div className="size-9 rounded-lg bg-white/25 grid place-items-center"><Icon className="size-4 text-white" /></div>
                    <div className="min-w-0">
                      <div className="font-medium text-sm text-white">{c.name}</div>
                      <div className="text-xs text-white/75 line-clamp-2">{c.description}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </Field>
          <Field label="Priority">
            <div className="flex gap-2">
              {PRIORITIES.map((p) => (
                <button
                  type="button" key={p} onClick={() => setPriority(p)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs capitalize border",
                    priority === p ? "border-white bg-white/25 text-white" : "border-white/30 text-white/75 hover:text-white",
                  )}
                >{p}</button>
              ))}
            </div>
          </Field>
          <Field label="Message">
            <textarea
              value={message} onChange={(e) => setMessage(e.target.value)} maxLength={2000} rows={6}
              placeholder="Provide as much detail as you can…"
              className="w-full px-3 py-2 rounded-lg bg-white/15 backdrop-blur border border-white/30 focus:border-white text-white placeholder:text-white/60 outline-none resize-none"
            />
          </Field>
          <Field label="Attachments (optional)">
            <FilePicker files={files} setFiles={setFiles} disabled={submitting} dark />
          </Field>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={onCancel} className="px-4 py-2 rounded-lg text-sm text-white/80 hover:text-white">Cancel</button>
            <button type="submit" disabled={submitting} className="px-4 py-2 rounded-lg bg-white text-rose-600 text-sm font-semibold hover:bg-white/90 disabled:opacity-50 shadow-lg">
              {submitting ? "Opening…" : "Open ticket"}
            </button>
          </div>
        </div>
      </form>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wider text-white/80 mb-2">{label}</div>
      {children}
    </div>
  );
}

function TicketDetail({
  ticket, categories, profiles, staff, isStaff, currentUserId,
}: {
  ticket: Ticket; categories: Category[]; profiles: Map<string, Profile>;
  staff: Profile[]; isStaff: boolean; currentUserId: string;
}) {
  const { hasAny } = useAuth();
  const isAdmin = hasAny(["admin", "management"]);
  const navigate = useNavigate();
  const cat = categories.find((c) => c.id === ticket.category_id);
  const CatIcon = ICONS[cat?.icon ?? "LifeBuoy"] ?? LifeBuoy;
  const StatusIcon = STATUS_META[ticket.status].Icon;

  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [internal, setInternal] = useState(false);
  const [sending, setSending] = useState(false);
  const [replyFiles, setReplyFiles] = useState<File[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const mention = useMentionAutocomplete({
    value: draft,
    onChange: setDraft,
    textareaRef: taRef,
    canBroadcast: isAdmin,
  });
  const [myUsername, setMyUsername] = useState<string | null>(null);
  useEffect(() => {
    supabase
      .from("profiles")
      .select("username")
      .eq("id", currentUserId)
      .maybeSingle()
      .then(({ data }) => setMyUsername(data?.username ?? null));
  }, [currentUserId]);

  const load = async () => {
    const { data } = await supabase
      .from("ticket_messages").select("*")
      .eq("ticket_id", ticket.id).order("created_at", { ascending: true });
    setMessages((data ?? []) as unknown as Message[]);
    // Pull missing sender profiles
    const missing = [...new Set((data ?? []).map((m) => m.sender_id))].filter((id) => !profiles.has(id));
    if (missing.length) {
      await supabase.from("profiles").select("id, display_name, username").in("id", missing);
    }
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel(`ticket-${ticket.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "ticket_messages", filter: `ticket_id=eq.${ticket.id}` },
        (p) => setMessages((m) => [...m, p.new as unknown as Message]))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticket.id]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length]);

  const send = async () => {
    const content = draft.trim();
    if ((content.length < 1 && replyFiles.length === 0) || content.length > 2000) return;
    if (ticket.status === "closed") return toast.error("Ticket is closed");
    setSending(true);
    const uploaded = replyFiles.length ? await uploadTicketFiles(replyFiles) : [];
    const { error } = await supabase.from("ticket_messages").insert({
      ticket_id: ticket.id, sender_id: currentUserId, content, is_internal: internal && isStaff,
      attachments: uploaded as unknown as never,
    });
    setSending(false);
    if (error) {
      const msg = error.message;
      return toast.error(
        msg.includes("@all") || msg.includes("@here")
          ? "Only admin and management can use @all or @here."
          : msg,
      );
    }
    setDraft("");
    setReplyFiles([]);
    // Bump updated_at via status touch (only staff allowed) — skip for users
    if (isStaff && ticket.status === "open") {
      await supabase.from("tickets").update({ status: "in_progress" }).eq("id", ticket.id);
    }
  };

  const updateField = async (patch: Partial<Pick<Ticket, "status" | "priority" | "assigned_to">>) => {
    const closing = patch.status === "closed" || patch.status === "resolved";
    const { error } = await supabase
      .from("tickets")
      .update({ ...patch, ...(closing ? { closed_at: new Date().toISOString() } : {}) })
      .eq("id", ticket.id);
    if (error) toast.error(error.message);
  };

  const deleteTicket = async () => {
    if (!confirm("Delete this ticket and all its messages? This cannot be undone.")) return;
    await supabase.from("ticket_messages").delete().eq("ticket_id", ticket.id);
    const { error } = await supabase.from("tickets").delete().eq("id", ticket.id);
    if (error) return toast.error(error.message);
    toast.success("Ticket deleted");
    navigate({ to: "/tickets", search: { id: undefined, view: undefined } });
  };

  const senderName = (id: string) => {
    const p = profiles.get(id);
    return p?.display_name || p?.username || (id === currentUserId ? "You" : "User");
  };

  return (
    <>
      <header className="border-b border-white/20 px-5 py-3 space-y-3 bg-white/5 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="size-9 rounded-lg bg-white/25 grid place-items-center"><CatIcon className="size-4 text-white" /></div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-xs text-white/80">
              <span>{cat?.name ?? "—"}</span>
              <span>·</span>
              <span>Opened by {senderName(ticket.user_id)}</span>
              <span>·</span>
              <span>{new Date(ticket.created_at).toLocaleDateString()}</span>
            </div>
            <h1 className="font-display font-semibold text-lg truncate text-white drop-shadow">{ticket.subject}</h1>
          </div>
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white/25 text-xs text-white">
            <StatusIcon className="size-3" /> {STATUS_META[ticket.status].label}
          </span>
          {isAdmin && (
            <button
              onClick={deleteTicket}
              title="Delete ticket"
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white text-rose-600 hover:bg-white/90 text-xs font-semibold shadow"
            >
              <Trash2 className="size-3" /> Delete
            </button>
          )}
        </div>
        {isStaff && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Select
              label="Status" value={ticket.status}
              options={(Object.keys(STATUS_META) as Status[]).map((s) => ({ value: s, label: STATUS_META[s].label }))}
              onChange={(v) => updateField({ status: v as Status })}
            />
            <Select
              label="Priority" value={ticket.priority}
              options={PRIORITIES.map((p) => ({ value: p, label: p }))}
              onChange={(v) => updateField({ priority: v as Priority })}
            />
            <Select
              label="Assignee" value={ticket.assigned_to ?? ""}
              options={[{ value: "", label: "Unassigned" }, ...staff.map((s) => ({ value: s.id, label: s.display_name || s.username || "Staff" }))]}
              onChange={(v) => updateField({ assigned_to: v || null })}
            />
            <span className={cn("ml-auto px-2 py-1 rounded text-xs capitalize", PRI_CLS[ticket.priority])}>{ticket.priority}</span>
          </div>
        )}
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
        {messages.map((m) => {
          const mine = m.sender_id === currentUserId;
          return (
            <div key={m.id} className={cn("flex gap-3", mine && "flex-row-reverse")}>
              <div className="size-8 rounded-full bg-white text-rose-600 grid place-items-center text-xs font-bold shrink-0 shadow">
                {senderName(m.sender_id).slice(0, 1).toUpperCase()}
              </div>
              <div className={cn("max-w-[70%] rounded-2xl px-4 py-2 text-sm shadow",
                m.is_internal ? "bg-amber-200/90 text-amber-950 border border-amber-300" :
                mine ? "bg-white text-rose-700" : "bg-white/20 backdrop-blur text-white border border-white/25",
              )}>
                <div className="text-[10px] uppercase tracking-wider opacity-70 mb-0.5 flex items-center gap-1">
                  {m.is_internal && <Lock className="size-3" />}
                  {senderName(m.sender_id)} · {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </div>
                <MentionText content={m.content} currentUsername={myUsername} />
                <TicketAttachments items={m.attachments} />
              </div>
            </div>
          );
        })}
      </div>

      <div className="border-t border-white/20 p-3 bg-white/5 backdrop-blur">
        {ticket.status === "closed" ? (
          <div className="text-center text-xs text-white/80 py-2">This ticket is closed.</div>
        ) : (
          <div className="space-y-2">
            <div className="relative flex gap-2">
              {mention.dropdown}
              <textarea
                ref={taRef}
                value={draft} onChange={(e) => setDraft(e.target.value)} rows={2} maxLength={2000}
                placeholder={internal ? "Internal note (staff only)… type @ to mention" : "Reply to ticket… type @ to mention"}
                onKeyDown={(e) => {
                  if (mention.onKeyDown(e)) return;
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send();
                }}
                className={cn(
                  "flex-1 px-3 py-2 rounded-lg bg-white/15 backdrop-blur border outline-none resize-none text-sm text-white placeholder:text-white/60",
                  internal ? "border-amber-300/70" : "border-white/30 focus:border-white",
                )}
              />
              <button
                onClick={send} disabled={sending || !draft.trim()}
                className="self-end px-3 py-2 rounded-lg bg-white text-rose-600 hover:bg-white/90 disabled:opacity-50 shadow"
              ><Send className="size-4" /></button>
            </div>
            <FilePicker files={replyFiles} setFiles={setReplyFiles} disabled={sending} dark />
            {isStaff && (
              <label className="flex items-center gap-2 text-xs text-white/85 cursor-pointer">
                <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} className="accent-amber-300" />
                <Lock className="size-3" /> Internal note (visible to staff only)
              </label>
            )}
          </div>
        )}
      </div>
    </>
  );
}

function Select({
  label, value, options, onChange,
}: { label: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void }) {
  return (
    <label className="inline-flex items-center gap-1.5 bg-white/20 backdrop-blur rounded-md px-2 py-1 border border-white/25">
      <span className="text-[10px] uppercase tracking-wider text-white/85">{label}</span>
      <select
        value={value} onChange={(e) => onChange(e.target.value)}
        className="bg-transparent text-xs outline-none capitalize text-white"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-rose-700 text-white">{o.label}</option>
        ))}
      </select>
    </label>
  );
}

type StaffShift = { id: string; user_id: string; clock_in: string };
type StaffBreak = { id: string; shift_id: string; user_id: string; kind: "break" | "lunch"; started_at: string };
type StaffProfile = { id: string; username: string | null; display_name: string | null; avatar_url: string | null };
const STAFF_BREAK_LIMITS = { break: 15 * 60, lunch: 30 * 60 } as const;

function StaffOnDutyStrip() {
  const [shifts, setShifts] = useState<StaffShift[]>([]);
  const [breaks, setBreaks] = useState<StaffBreak[]>([]);
  const [profiles, setProfiles] = useState<Record<string, StaffProfile>>({});
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const refresh = async () => {
    const [{ data: s }, { data: b }] = await Promise.all([
      supabase.from("shifts").select("id,user_id,clock_in").is("clock_out", null),
      supabase.from("breaks").select("id,shift_id,user_id,kind,started_at").is("ended_at", null),
    ]);
    const ss = (s as StaffShift[]) ?? [];
    setShifts(ss);
    setBreaks((b as StaffBreak[]) ?? []);
    const ids = Array.from(new Set(ss.map((x) => x.user_id)));
    if (ids.length) {
      const { data: profs } = await supabase
        .from("profiles").select("id,username,display_name,avatar_url").in("id", ids);
      setProfiles(Object.fromEntries(((profs as StaffProfile[]) ?? []).map((p) => [p.id, p])));
    } else {
      setProfiles({});
    }
  };

  useEffect(() => {
    refresh();
    const ch = supabase
      .channel("tickets-staff-onduty")
      .on("postgres_changes", { event: "*", schema: "public", table: "shifts" }, () => refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "breaks" }, () => refresh())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const breakByUser = useMemo(() => {
    const m = new Map<string, StaffBreak>();
    for (const br of breaks) m.set(br.user_id, br);
    return m;
  }, [breaks]);

  if (shifts.length === 0) return null;

  const fmtMinSec = (sec: number) => {
    const s = Math.max(0, Math.floor(sec));
    const m = Math.floor(s / 60).toString().padStart(2, "0");
    const ss = (s % 60).toString().padStart(2, "0");
    return `${m}:${ss}`;
  };
  const fmtHMS = (sec: number) => {
    const s = Math.max(0, Math.floor(sec));
    const h = Math.floor(s / 3600).toString().padStart(2, "0");
    const m = Math.floor((s % 3600) / 60).toString().padStart(2, "0");
    return `${h}h ${m}m`;
  };

  return (
    <div className="px-4 pt-4">
      <div className="rounded-xl bg-white/15 backdrop-blur border border-white/25 p-3 shadow-lg">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-white/90">
            Staff on duty · {shifts.length}
          </div>
          <div className="flex items-center gap-1 text-[10px] text-white/80">
            <span className="size-2 rounded-full bg-emerald-400 animate-pulse" /> live
          </div>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {shifts.map((s) => {
            const p = profiles[s.user_id];
            const name = p?.display_name || p?.username || "Staff";
            const initials = name.slice(0, 2).toUpperCase();
            const br = breakByUser.get(s.user_id);
            const shiftElapsed = (now - new Date(s.clock_in).getTime()) / 1000;
            const onBreak = !!br;
            const brElapsed = br ? (now - new Date(br.started_at).getTime()) / 1000 : 0;
            const brRemain = br ? STAFF_BREAK_LIMITS[br.kind] - brElapsed : 0;
            const over = brRemain < 0;
            return (
              <div
                key={s.id}
                className={cn(
                  "shrink-0 min-w-[180px] rounded-lg p-2.5 border backdrop-blur transition-colors",
                  onBreak
                    ? (over ? "bg-red-500/30 border-red-300/60" : "bg-amber-300/30 border-amber-200/60")
                    : "bg-emerald-400/25 border-emerald-200/50",
                )}
              >
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <img src={p?.avatar_url || "/default-avatar.png"} alt={name} className="size-8 rounded-full object-cover ring-2 ring-white/40" />
                    <span className={cn(
                      "absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full ring-2 ring-white",
                      onBreak ? (over ? "bg-red-500" : "bg-amber-400") : "bg-emerald-500",
                    )} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-white truncate">{name}</div>
                    <div className="text-[10px] text-white/80">On {fmtHMS(shiftElapsed)}</div>
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-1.5 text-[11px] font-medium text-white">
                  {onBreak ? (
                    <>
                      {br!.kind === "lunch" ? <UtensilsCrossed className="size-3.5" /> : <Coffee className="size-3.5" />}
                      <span className="capitalize">{br!.kind}</span>
                      <span className="ml-auto tabular-nums">
                        {over ? `+${fmtMinSec(-brRemain)}` : fmtMinSec(brRemain)}
                      </span>
                    </>
                  ) : (
                    <>
                      <CircleDot className="size-3.5" />
                      <span>Working</span>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
