import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import ticketsHero from "@/assets/tickets-hero.jpg";
import {
  Ticket as TicketIcon, Plus, Send, Lock, X, LifeBuoy, CreditCard, Bug, Sparkles, UserCog,
  Tv, Film, Circle, CircleDot, Clock4, CheckCircle2, XCircle, ChevronDown, Trash2, Coffee, UtensilsCrossed,
  Paperclip, FileText, Star, HelpCircle,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { MentionText, useMentionAutocomplete } from "@/components/app/mentions";
import { useUserTimezone } from "@/hooks/use-user-timezone";
import { useServerFn } from "@tanstack/react-start";
import { verifyTurnstile } from "@/lib/turnstile.functions";
import { TurnstileWidget } from "@/components/app/TurnstileWidget";
import { getOutOfHoursMessage } from "@/lib/business-hours";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useRoleFlashMap, resolveAvatarUrl, roleFlashClass } from "@/lib/role-flash";

export const Route = createFileRoute("/_authenticated/_approved/tickets")({
  validateSearch: (s: Record<string, unknown>) => ({
    id: typeof s.id === "string" ? s.id : undefined,
    view: (s.view === "mine" || s.view === "all" || s.view === "assigned") ? s.view : undefined,
    new2fa: s.new2fa === 1 || s.new2fa === "1" ? 1 : undefined,
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

export type UploadProgress = {
  index: number;       // 0-based file currently uploading
  total: number;
  name: string;
  done: number;        // count of completed files
};

async function uploadTicketFiles(
  files: File[],
  userId: string,
  onProgress?: (p: UploadProgress) => void,
): Promise<Attachment[]> {
  const out: Attachment[] = [];
  if (!userId) {
    toast.error("You must be signed in to upload attachments");
    return out;
  }
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    onProgress?.({ index: i, total: files.length, name: f.name, done: i });
    if (f.size > 25 * 1024 * 1024) {
      toast.error(`${f.name} is over 25MB`);
      continue;
    }
    const safe = f.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}`;
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
    onProgress?.({ index: i, total: files.length, name: f.name, done: i + 1 });
  }
  return out;
}

function UploadProgressBar({ progress }: { progress: UploadProgress | null }) {
  if (!progress) return null;
  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
  return (
    <div className="space-y-1 rounded-lg border border-white/30 bg-white/10 px-3 py-2 text-xs text-white">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate">
          Uploading {progress.done < progress.total ? progress.index + 1 : progress.total} of {progress.total}: {progress.name}
        </span>
        <span className="tabular-nums opacity-80">{pct}%</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-white/20 overflow-hidden">
        <div
          className="h-full bg-white transition-all duration-200"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
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
  const [tab, setTab] = useState<"welcome" | "tickets">("welcome");
  const [allRatings, setAllRatings] = useState<{ rating: number }[]>([]);
  const [myRatings, setMyRatings] = useState<Record<string, number>>({});

  // Load categories once
  useEffect(() => {
    supabase.from("ticket_categories").select("*").order("sort_order").then(({ data }) => setCategories(data ?? []));
  }, []);

  // Load ratings for hero average + per-ticket "my rating"
  const loadRatings = async () => {
    const { data } = await supabase.from("ticket_ratings").select("ticket_id,user_id,rating");
    const rows = (data ?? []) as { ticket_id: string; user_id: string; rating: number }[];
    setAllRatings(rows.map((r) => ({ rating: r.rating })));
    if (user) {
      const mine: Record<string, number> = {};
      for (const r of rows) if (r.user_id === user.id) mine[r.ticket_id] = r.rating;
      setMyRatings(mine);
    }
  };
  useEffect(() => { loadRatings(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [user?.id]);

  const avgRating = allRatings.length
    ? allRatings.reduce((s, r) => s + r.rating, 0) / allRatings.length
    : 0;
  const ratingCount = allRatings.length;

  const rateTicket = async (ticketId: string, v: number) => {
    if (!user) return;
    setMyRatings({ ...myRatings, [ticketId]: v });
    const { error } = await supabase
      .from("ticket_ratings")
      .upsert({ ticket_id: ticketId, user_id: user.id, rating: v } as never, { onConflict: "ticket_id,user_id" });
    if (error) { toast.error(error.message); return; }
    toast.success("Thanks for your feedback!");
    loadRatings();
  };

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
  const detailPanelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (search.id && selected) {
      detailPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [search.id, selected]);

  const groups = useMemo(() => {
    const buckets: Record<Status, Ticket[]> = { open: [], in_progress: [], waiting: [], resolved: [], closed: [] };
    tickets.forEach((t) => buckets[t.status].push(t));
    return (Object.keys(STATUS_META) as Status[])
      .filter((s) => buckets[s].length)
      .map((s) => ({ label: STATUS_META[s].label }));
  }, [tickets]);

  const setView = (v: "mine" | "all" | "assigned") =>
    navigate({ to: "/tickets", search: { view: v, id: undefined } });

  useEffect(() => {
    if (search.id || creating) setTab("tickets");
  }, [search.id, creating]);

  // Deep-link from /mfa-challenge: open the new-ticket form prefilled for a 2FA reset
  useEffect(() => {
    if (search.new2fa === 1 && !creating && !search.id) {
      setCreating(true);
      setTab("tickets");
    }
  }, [search.new2fa, creating, search.id]);

  return (
    <main className="flex-1 overflow-y-auto bg-gradient-to-br from-rose-950 via-fuchsia-950/60 to-slate-950 text-white">
      {/* Hero — image + gradient + welcome text, with rating blended in */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0">
          <img src={ticketsHero} alt="" aria-hidden className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-br from-rose-700/85 via-fuchsia-700/75 to-violet-800/85" />
          <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-b from-transparent to-rose-950" />
        </div>
        <div className="relative px-6 md:px-10 pt-10 md:pt-14 pb-20 md:pb-24 flex flex-col md:flex-row md:items-center md:gap-8">
         <div className="max-w-3xl flex-1">
          <div className="text-xs uppercase tracking-[0.2em] text-rose-100/90 mb-3">BM Support · Help Desk</div>
          <h1 className="font-display text-4xl md:text-5xl font-bold leading-tight drop-shadow">
            Support Tickets
          </h1>
          <p className="mt-4 text-rose-100/90 max-w-xl text-base md:text-lg">
            Open a ticket and our team will get back to you fast. Rate every conversation
            to help us keep our support world-class.
          </p>
          <div className="mt-6 inline-flex items-center gap-3 rounded-2xl bg-white/10 backdrop-blur border border-white/25 px-4 py-2.5 shadow-lg">
            <div className="flex">
              {[1, 2, 3, 4, 5].map((n) => (
                <Star
                  key={n}
                  className={cn(
                    "size-4",
                    n <= Math.round(avgRating)
                      ? "text-amber-300 fill-amber-300"
                      : "text-white/40",
                  )}
                />
              ))}
            </div>
            <div className="text-sm">
              <span className="font-bold tabular-nums">
                {ratingCount > 0 ? avgRating.toFixed(1) : "—"}
              </span>
              <span className="text-rose-100/85 ml-1.5">
                {ratingCount > 0
                  ? `from ${ratingCount} customer rating${ratingCount === 1 ? "" : "s"}`
                  : "No ratings yet"}
              </span>
            </div>
          </div>
         </div>
         <div className="mt-6 md:mt-0 md:w-[340px] md:shrink-0 [&>div]:px-0 [&>div]:pt-0">
           <StaffOnDutyStrip />
         </div>
        </div>
      </section>

      {/* Tabs */}
      <div className="px-6 md:px-10 pb-10 mt-6 relative">
        <Tabs value={tab} onValueChange={(v) => setTab(v as "welcome" | "tickets")}>
          <TabsList className="bg-rose-950/60 border border-rose-500/30">
            <TabsTrigger
              value="welcome"
              className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-rose-500 data-[state=active]:to-fuchsia-500 data-[state=active]:text-white"
            >
              Welcome
            </TabsTrigger>
            <TabsTrigger
              value="tickets"
              className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-rose-500 data-[state=active]:to-fuchsia-500 data-[state=active]:text-white"
            >
              Tickets
            </TabsTrigger>
          </TabsList>

          <TabsContent value="welcome" className="mt-6">
            <div className="rounded-2xl bg-gradient-to-br from-rose-600/30 via-fuchsia-600/20 to-violet-700/30 border border-rose-500/30 p-8 md:p-10 shadow-[0_0_60px_-15px_rgba(244,63,94,0.4)]">
              <h2 className="font-display text-2xl md:text-3xl font-bold">Welcome to the Help Desk</h2>
              <p className="mt-3 text-rose-100/90 max-w-2xl">
                Account questions, billing, Live TV or Movies & Series issues — we've got you
                covered. Open a ticket and we'll respond as soon as a staff member is on duty.
              </p>
              <p className="mt-3 text-rose-200/80 max-w-2xl text-sm">
                Once your ticket is resolved, leave a rating so we know how we did.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  onClick={() => { setCreating(true); setTab("tickets"); }}
                  className="inline-flex items-center gap-2 rounded-xl bg-white text-rose-600 font-semibold px-4 py-2.5 shadow-lg shadow-rose-900/40 hover:bg-white/90"
                >
                  <Plus className="size-4" /> New ticket
                </button>
                <button
                  onClick={() => setTab("tickets")}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/25 bg-white/10 backdrop-blur px-4 py-2.5 text-sm hover:bg-white/20"
                >
                  <TicketIcon className="size-4" /> View tickets
                </button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="tickets" className="mt-6">
            <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-4">
              {/* Left list */}
              <aside className="rounded-2xl bg-rose-950/50 border border-rose-500/30 p-4 h-fit backdrop-blur space-y-3">
                <button
                  onClick={() => { setCreating(true); navigate({ to: "/tickets", search: { id: undefined, view } }); }}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-white text-rose-600 text-sm font-semibold hover:bg-white/90 shadow"
                >
                  <Plus className="size-4" /> New ticket
                </button>
                {isStaff && (
                  <div className="flex gap-1 bg-white/10 p-1 rounded-lg text-xs">
                    {(["mine", "assigned", "all"] as const).map((v) => (
                      <button
                        key={v}
                        onClick={() => setView(v)}
                        className={cn(
                          "flex-1 px-2 py-1 rounded-md capitalize transition-colors",
                          view === v ? "bg-white text-rose-600" : "text-white/70 hover:text-white",
                        )}
                      >{v}</button>
                    ))}
                  </div>
                )}
                <div className="space-y-3">
                  {tickets.length === 0 && (
                    <div className="text-xs text-white/70 px-2 py-3 text-center">No tickets yet.</div>
                  )}
                  {groups.map((g) => (
                    <div key={g.label}>
                      <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-white/70 flex items-center gap-1">
                        <ChevronDown className="size-3" />{g.label}
                      </div>
                      <div className="space-y-px">
                        {tickets.filter((t) => STATUS_META[t.status].label === g.label).map((t) => {
                          const cat = categories.find((c) => c.id === t.category_id);
                          const Icon = ICONS[cat?.icon ?? "LifeBuoy"] ?? LifeBuoy;
                          const active = selected?.id === t.id;
                          const p = profiles.get(t.user_id);
                          const who = p?.display_name || p?.username || "Unknown";
                          const claimP = t.assigned_to ? profiles.get(t.assigned_to) : null;
                          const claimedBy = claimP?.display_name || claimP?.username || (t.assigned_to ? "Staff" : null);
                          const when = new Date(t.created_at).toLocaleString(undefined, {
                            month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                          });
                          return (
                            <button
                              key={t.id}
                              onClick={() => { setCreating(false); navigate({ to: "/tickets", search: { id: t.id, view } }); }}
                              className={cn(
                                "w-full text-left flex items-start gap-2 px-2 py-1.5 rounded-md text-sm transition-colors",
                                active ? "bg-white/20 text-white" : "text-white/80 hover:bg-white/10 hover:text-white",
                              )}
                            >
                              <Icon className="size-4 shrink-0 mt-0.5" />
                              <span className="flex-1 min-w-0">
                                <span className="flex items-center gap-1.5">
                                  <span className="truncate flex-1">{t.subject}</span>
                                  {t.priority === "urgent" && <span className="size-1.5 rounded-full bg-rose-300 shrink-0" />}
                                  {t.priority === "high" && <span className="size-1.5 rounded-full bg-amber-300 shrink-0" />}
                                </span>
                                <span className="block text-[10px] text-white/60 truncate">{who} · {when}</span>
                                {claimedBy && (
                                  <span className="block text-[10px] text-emerald-200/90 truncate">Claimed by {claimedBy}</span>
                                )}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </aside>

              {/* Right panel */}
              <div
                ref={detailPanelRef}
                className="rounded-2xl bg-gradient-to-br from-violet-600 via-fuchsia-600 to-rose-600 text-white relative overflow-hidden min-h-[600px] flex flex-col scroll-mt-16"
              >
                <div className="pointer-events-none absolute inset-0 opacity-60" style={{
                  background:
                    "radial-gradient(800px 400px at 0% 0%, rgba(244,63,94,0.45), transparent 60%), radial-gradient(700px 400px at 100% 0%, rgba(168,85,247,0.4), transparent 60%)",
                }} />
                <div className="relative flex-1 flex flex-col min-h-0">
                  {creating ? (
                    <NewTicketForm
                      categories={categories}
                      onCancel={() => setCreating(false)}
                      onCreated={(id) => { setCreating(false); navigate({ to: "/tickets", search: { id, view } }); }}
                      preset={search.new2fa === 1 ? "2fa-reset" : undefined}
                    />
                  ) : selected ? (
                    <TicketDetail
                      ticket={selected}
                      categories={categories}
                      profiles={profiles}
                      staff={staff}
                      isStaff={isStaff}
                      currentUserId={user!.id}
                      myRating={myRatings[selected.id] ?? 0}
                      onRate={(v) => rateTicket(selected.id, v)}
                    />
                  ) : (
                    <div className="flex-1 grid place-items-center p-8">
                      <div className="text-center max-w-sm">
                        <div className="size-14 rounded-2xl bg-white/20 backdrop-blur grid place-items-center mx-auto mb-4 shadow-lg">
                          <TicketIcon className="size-6 text-white" />
                        </div>
                        <h2 className="font-display text-xl font-bold drop-shadow">Support tickets</h2>
                        <p className="text-white/85 text-sm mt-2">
                          {tickets.length === 0 ? "Open your first ticket to get help from the team." : "Select a ticket from the list."}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}

function NewTicketForm({
  categories, onCancel, onCreated, preset,
}: { categories: Category[]; onCancel: () => void; onCreated: (id: string) => void; preset?: "2fa-reset" }) {
  const { user } = useAuth();
  const resetCat = categories.find((c) => c.slug === "account-2fa-reset");
  const [subject, setSubject] = useState(preset === "2fa-reset" ? "2FA reset request" : "");
  const [categoryId, setCategoryId] = useState(
    preset === "2fa-reset" && resetCat ? resetCat.id : categories[0]?.id ?? ""
  );
  const [priority, setPriority] = useState<Priority>(preset === "2fa-reset" ? "high" : "normal");
  const [message, setMessage] = useState(
    preset === "2fa-reset"
      ? "I've lost access to my authenticator app and need 2FA reset on my account.\n\nPlease verify my identity and reset 2FA so I can sign in again."
      : ""
  );
  const [submitting, setSubmitting] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const [captchaToken, setCaptchaToken] = useState("");
  const verifyCaptcha = useServerFn(verifyTurnstile);

  useEffect(() => { if (!categoryId && categories[0]) setCategoryId(categories[0].id); }, [categories, categoryId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = newTicketSchema.safeParse({ subject, category_id: categoryId, priority, message });
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    if (!parsed.data.message && files.length === 0) return toast.error("Add a message or attach a file");
    if (!captchaToken) return toast.error("Please complete the captcha.");
    setSubmitting(true);
    try {
      const v = await verifyCaptcha({ data: { token: captchaToken } });
      if (!v?.success) {
        setSubmitting(false);
        setCaptchaToken("");
        return toast.error("Captcha verification failed. Please try again.");
      }
    } catch {
      setSubmitting(false);
      setCaptchaToken("");
      return toast.error("Captcha verification failed. Please try again.");
    }
    const uploaded = files.length ? await uploadTicketFiles(files, user!.id, setUploadProgress) : [];
    setUploadProgress(null);
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

    if (cat?.slug === "owner-management") {
      await supabase.from("ticket_messages").insert({
        ticket_id: t.id,
        sender_id: user!.id,
        content:
          "🔒 This ticket is private to the **Owner and Management team**.\n\nNo other staff or moderators can see or reply to this conversation. A member of management will respond as soon as possible.",
        is_internal: false,
      });
    }

    const oohMsg = await getOutOfHoursMessage();
    if (oohMsg) {
      await supabase.from("ticket_messages").insert({
        ticket_id: t.id,
        sender_id: user!.id,
        content: oohMsg,
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
          {uploadProgress && (
            <UploadProgressBar progress={uploadProgress} />
          )}
          <Field label="Security check">
            <TurnstileWidget
              onToken={setCaptchaToken}
              onExpire={() => setCaptchaToken("")}
            />
          </Field>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={onCancel} className="px-4 py-2 rounded-lg text-sm text-white/80 hover:text-white">Cancel</button>
            <button type="submit" disabled={submitting || !captchaToken} className="px-4 py-2 rounded-lg bg-white text-rose-600 text-sm font-semibold hover:bg-white/90 disabled:opacity-50 shadow-lg">
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
  ticket, categories, profiles, staff, isStaff, currentUserId, myRating, onRate,
}: {
  ticket: Ticket; categories: Category[]; profiles: Map<string, Profile>;
  staff: Profile[]; isStaff: boolean; currentUserId: string;
  myRating: number; onRate: (v: number) => void;
}) {
  const { hasAny } = useAuth();
  const isAdmin = hasAny(["admin", "management"]);
  const tz = useUserTimezone();
  const navigate = useNavigate();
  const cat = categories.find((c) => c.id === ticket.category_id);
  const CatIcon = ICONS[cat?.icon ?? "LifeBuoy"] ?? LifeBuoy;
  const StatusIcon = STATUS_META[ticket.status].Icon;

  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [internal, setInternal] = useState(false);
  const [sending, setSending] = useState(false);
  const [replyFiles, setReplyFiles] = useState<File[]>([]);
  const [replyProgress, setReplyProgress] = useState<UploadProgress | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const [othersTyping, setOthersTyping] = useState<Record<string, { isStaff: boolean; at: number }>>({});
  const typingTimerRef = useRef<number | null>(null);
  const lastSentTypingRef = useRef(0);
  const typingChannelReadyRef = useRef(false);
  const draftRef = useRef("");
  const internalRef = useRef(false);
  useEffect(() => { internalRef.current = internal; }, [internal]);
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
      .channel(`ticket-${ticket.id}`, { config: { broadcast: { self: false }, presence: { key: currentUserId } } })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "ticket_messages", filter: `ticket_id=eq.${ticket.id}` },
        (p) => {
          const nm = p.new as unknown as Message;
          setMessages((m) => (m.some((x) => x.id === nm.id) ? m : [...m, nm]));
          setOthersTyping((s) => {
            if (!s[nm.sender_id]) return s;
            const next = { ...s }; delete next[nm.sender_id]; return next;
          });
        })
      .on("broadcast", { event: "typing" }, (payload) => {
        const d = (payload?.payload ?? {}) as { userId?: string; isStaff?: boolean; internal?: boolean; stopped?: boolean };
        if (!d.userId || d.userId === currentUserId) return;
        // Don't reveal internal-note typing to non-staff users
        if (d.internal && !isStaff) return;
        setOthersTyping((s) => {
          if (d.stopped) {
            if (!s[d.userId!]) return s;
            const next = { ...s }; delete next[d.userId!]; return next;
          }
          return { ...s, [d.userId!]: { isStaff: !!d.isStaff, at: Date.now() } };
        });
      })
      .on("presence", { event: "sync" }, () => {
        const state = ch.presenceState() as Record<string, Array<{ userId?: string; isStaff?: boolean; internal?: boolean; typing?: boolean; at?: number }>>;
        const next: Record<string, { isStaff: boolean; at: number }> = {};
        Object.values(state).flat().forEach((p) => {
          if (!p.userId || p.userId === currentUserId || !p.typing) return;
          if (p.internal && !isStaff) return;
          next[p.userId] = { isStaff: !!p.isStaff, at: p.at ?? Date.now() };
        });
        setOthersTyping(next);
      })
      .subscribe((status) => {
        typingChannelReadyRef.current = status === "SUBSCRIBED";
        if (status === "SUBSCRIBED" && draftRef.current.trim()) sendTyping(false);
      });
    channelRef.current = ch;
    return () => {
      typingChannelReadyRef.current = false;
      channelRef.current = null;
      if (typingTimerRef.current) { window.clearTimeout(typingTimerRef.current); typingTimerRef.current = null; }
      void ch.untrack();
      supabase.removeChannel(ch);
      setOthersTyping({});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticket.id, currentUserId, isStaff]);

  // Expire stale typing indicators after 4s
  useEffect(() => {
    if (Object.keys(othersTyping).length === 0) return;
    const t = window.setInterval(() => {
      const now = Date.now();
      setOthersTyping((s) => {
        let changed = false;
        const next: typeof s = {};
        for (const [k, v] of Object.entries(s)) {
          if (now - v.at < 4000) next[k] = v; else changed = true;
        }
        return changed ? next : s;
      });
    }, 1000);
    return () => window.clearInterval(t);
  }, [othersTyping]);

  function sendTyping(stopped: boolean) {
    if (!channelRef.current || !currentUserId || !typingChannelReadyRef.current) return;
    const now = Date.now();
    if (!stopped && now - lastSentTypingRef.current < 1500) return;
    if (!stopped) lastSentTypingRef.current = now;
    const payload = { userId: currentUserId, isStaff, internal: internalRef.current, typing: !stopped, at: now, stopped };
    if (stopped) void channelRef.current.untrack();
    else void channelRef.current.track(payload);
    void channelRef.current.send({ type: "broadcast", event: "typing", payload });
  }

  const onDraftChange = (v: string) => {
    draftRef.current = v;
    setDraft(v);
    if (v.trim().length === 0) {
      sendTyping(true);
      if (typingTimerRef.current) { window.clearTimeout(typingTimerRef.current); typingTimerRef.current = null; }
      return;
    }
    sendTyping(false);
    if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
    typingTimerRef.current = window.setTimeout(() => sendTyping(true), 3000);
  };

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length]);

  const send = async () => {
    const content = draft.trim();
    if ((content.length < 1 && replyFiles.length === 0) || content.length > 2000) return;
    if (ticket.status === "closed") return toast.error("Ticket is closed");
    setSending(true);
    const uploaded = replyFiles.length ? await uploadTicketFiles(replyFiles, currentUserId, setReplyProgress) : [];
    setReplyProgress(null);
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
    draftRef.current = "";
    if (typingTimerRef.current) { window.clearTimeout(typingTimerRef.current); typingTimerRef.current = null; }
    sendTyping(true);
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
              <span>{new Date(ticket.created_at).toLocaleDateString([], { timeZone: tz })}</span>
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
            <RequestAdminHelpButton ticketId={ticket.id} />
          </div>
        )}
      </header>

      <RatingPromptDialog
        ticket={ticket}
        currentUserId={currentUserId}
        myRating={myRating}
        onRate={onRate}
      />

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
                  {senderName(m.sender_id)} · {new Date(m.created_at).toLocaleString([], { dateStyle: "short", timeStyle: "short", timeZone: tz })}
                </div>
                <MentionText content={m.content} currentUsername={myUsername} />
                <TicketAttachments items={m.attachments} />
              </div>
            </div>
          );
        })}
      </div>

      {othersTyping && Object.keys(othersTyping).length > 0 && ticket.status !== "closed" && (() => {
        const anyStaff = Object.values(othersTyping).some((v) => v.isStaff);
        const anyUser = Object.values(othersTyping).some((v) => !v.isStaff);
        const label = isStaff
          ? (anyUser ? "User is typing" : "Staff is typing")
          : (anyStaff ? "Staff is typing" : "User is typing");
        return (
          <div className="px-5 pb-1 text-[11px] text-white/80 flex items-center gap-2">
            <span className="inline-flex gap-0.5">
              <span className="size-1.5 rounded-full bg-white/70 animate-bounce [animation-delay:-0.3s]" />
              <span className="size-1.5 rounded-full bg-white/70 animate-bounce [animation-delay:-0.15s]" />
              <span className="size-1.5 rounded-full bg-white/70 animate-bounce" />
            </span>
            <span>{label}…</span>
          </div>
        );
      })()}

      <div className="border-t border-white/20 p-3 bg-white/5 backdrop-blur">
        {ticket.status === "closed" ? (
          <div className="text-center text-xs text-white/80 py-2">This ticket is closed.</div>
        ) : (
          <div className="space-y-2">
            <div className="relative flex gap-2">
              {mention.dropdown}
              <textarea
                ref={taRef}
                value={draft} onChange={(e) => onDraftChange(e.target.value)} rows={2} maxLength={2000}
                onBlur={() => sendTyping(true)}
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
                onClick={send} disabled={sending || (!draft.trim() && replyFiles.length === 0)}
                className="self-end px-3 py-2 rounded-lg bg-white text-rose-600 hover:bg-white/90 disabled:opacity-50 shadow"
              ><Send className="size-4" /></button>
            </div>
            <FilePicker files={replyFiles} setFiles={setReplyFiles} disabled={sending} dark />
            {replyProgress && <UploadProgressBar progress={replyProgress} />}
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
  const roleFlashMap = useRoleFlashMap();

  const visibleShifts = useMemo(
    () => shifts.filter((s) => roleFlashMap.get(s.user_id) !== "moderator"),
    [shifts, roleFlashMap],
  );

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

  if (visibleShifts.length === 0) return null;

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
            Staff on duty · {visibleShifts.length}
          </div>
          <div className="flex items-center gap-1 text-[10px] text-white/80">
            <span className="size-2 rounded-full bg-emerald-400 animate-pulse" /> live
          </div>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {visibleShifts.map((s) => {
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
                    <img src={resolveAvatarUrl(s.user_id, p?.avatar_url, roleFlashMap)} alt={name} className="size-8 rounded-full object-cover ring-2 ring-white/40" />
                    <span className={cn(
                      "absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full ring-2 ring-white",
                      onBreak ? (over ? "bg-red-500" : "bg-amber-400") : "bg-emerald-500",
                    )} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <div className={cn("text-sm font-semibold text-white truncate", roleFlashClass(roleFlashMap.get(s.user_id)))}>{name}</div>
                      {roleFlashMap.get(s.user_id) && (
                        <span className="text-[9px] font-medium uppercase tracking-wider text-white/70">
                          {roleFlashMap.get(s.user_id)}
                        </span>
                      )}
                    </div>
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

function RatingPromptDialog({
  ticket,
  currentUserId,
  myRating,
  onRate,
}: {
  ticket: Ticket;
  currentUserId: string;
  myRating: number;
  onRate: (v: number) => void;
}) {
  const isOwner = ticket.user_id === currentUserId;
  const isResolved = ticket.status === "resolved" || ticket.status === "closed";
  const eligible = isOwner && isResolved;
  const dismissKey = `ticket-rating-dismissed-${ticket.id}`;

  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(0);

  useEffect(() => {
    if (!eligible) { setOpen(false); return; }
    if (myRating > 0) { setOpen(false); return; }
    if (typeof window !== "undefined" && sessionStorage.getItem(dismissKey)) return;
    setOpen(true);
  }, [eligible, myRating, dismissKey]);

  if (!eligible) return null;

  const handleSelect = (n: number) => {
    onRate(n);
    setOpen(false);
  };
  const handleClose = (next: boolean) => {
    setOpen(next);
    if (!next && myRating === 0 && typeof window !== "undefined") {
      sessionStorage.setItem(dismissKey, "1");
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>How did we do?</DialogTitle>
          <DialogDescription>
            Tap a star to rate your support experience.
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-center gap-1 py-4" onMouseLeave={() => setHover(0)}>
          {[1, 2, 3, 4, 5].map((n) => {
            const filled = n <= (hover || myRating);
            return (
              <button
                key={n}
                type="button"
                onMouseEnter={() => setHover(n)}
                onClick={() => handleSelect(n)}
                className="p-1 transition-transform hover:scale-110"
                aria-label={`${n} star${n === 1 ? "" : "s"}`}
              >
                <Star className={cn("size-9", filled ? "text-yellow-400 fill-yellow-400" : "text-muted-foreground/40")} />
              </button>
            );
          })}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => handleClose(false)}>Maybe later</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RequestAdminHelpButton({ ticketId }: { ticketId: string }) {
  const [busy, setBusy] = useState(false);
  const onClick = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("request_ticket_admin_help", {
        _ticket_id: ticketId,
      } as never);
      if (error) {
        toast.error(error.message || "Couldn't notify admins");
      } else if (typeof data === "number" && data === 0) {
        toast.message("Admins were already notified recently. Please wait a few minutes.");
      } else {
        toast.success("Admin and management have been notified.");
      }
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      title="Request help from admin or management"
      className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-amber-300 text-amber-950 hover:bg-amber-200 disabled:opacity-60 text-xs font-semibold shadow"
    >
      <HelpCircle className="size-3.5" />
      {busy ? "Notifying…" : "Request admin help"}
    </button>
  );
}
