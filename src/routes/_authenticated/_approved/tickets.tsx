import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import ticketsHero from "@/assets/tickets-hero.jpg";
import {
  Ticket as TicketIcon, Plus, Send, Lock, X, LifeBuoy, CreditCard, Bug, Sparkles, UserCog,
  Tv, Film, Circle, CircleDot, Clock4, CheckCircle2, XCircle, ChevronDown, Trash2,
  Paperclip, FileText, Star, HelpCircle, Ban, Home, Pencil, Check, Forward,

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
import { ActiveOutagesBox } from "@/components/app/ActiveOutagesBox";
import { PayOrderDialog, OrderProgressStrip } from "@/components/app/OrderPaymentDialog";
import { getOrderBankTransferAccess, confirmBankTransferReceived } from "@/lib/bank-transfer.functions";
import { PaymentStatusTimeline, type PayCheckPhase } from "@/components/app/PaymentStatusTimeline";
import { isSettledPaymentStatus } from "@/lib/payment-status";

import { cancelOrderAndSquareInvoice } from "@/lib/square-invoices.functions";
import { checkOrderPaymentAcrossProviders } from "@/lib/order-payment-check.functions";
import { getOrderPaymentState } from "@/lib/order-payment-state.functions";
import { formatRoleLabel } from "@/lib/role-label";
import { notifyTicketReply, notifyStaffOfCustomerReply, handOverTicket } from "@/lib/ticket-notify.functions";
import { sendNewTicketPush } from "@/lib/push.functions";
import { StaffOnDutyStrip } from "@/components/app/StaffOnDutyStrip";
import { Nameplate } from "@/components/app/Nameplate";
import { QuickRepliesPill } from "@/components/app/QuickRepliesDialog";
import { useChannelJump } from "@/components/app/ChannelJump";
import {
  applyOrderToCredential,
  createCredentialForOrder,
  type CredentialCandidate,
  type ApplyOrderResult,
} from "@/lib/order-fulfilment.functions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";


export const Route = createFileRoute("/_authenticated/_approved/tickets")({
  validateSearch: (s: Record<string, unknown>): { id?: string; view?: "mine" | "all" | "assigned"; new2fa?: 1 } => ({
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
  created_at: string; updated_at: string; order_id?: string | null;
}
interface Message { id: string; ticket_id: string; sender_id: string; content: string; is_internal: boolean; created_at: string; edited_at?: string | null; attachments?: Attachment[]; }
interface Attachment { name: string; path: string; size: number; type: string; }
interface Profile { id: string; display_name: string | null; username: string | null; avatar_url?: string | null; equipped_nameplate_id?: string | null; role?: "admin" | "management" | "staff" | "moderator" | null; }

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

function extractImagesFromClipboard(e: React.ClipboardEvent): File[] {
  const items = e.clipboardData?.items;
  if (!items) return [];
  const out: File[] = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (it.kind === "file" && it.type.startsWith("image/")) {
      const f = it.getAsFile();
      if (f) {
        const ext = (f.type.split("/")[1] || "png").split("+")[0];
        const named = f.name && f.name !== "image.png"
          ? f
          : new File([f], `pasted-${Date.now()}.${ext}`, { type: f.type });
        out.push(named);
      }
    }
  }
  return out;
}

function TicketsPage() {
  const { user, isStaff, hasAny } = useAuth();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const canBeAssigned = hasAny(["admin", "management", "staff"]);
  const view = search.view ?? (canBeAssigned ? "assigned" : isStaff ? "all" : "mine");

  const [categories, setCategories] = useState<Category[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [profiles, setProfiles] = useState<Map<string, Profile>>(new Map());
  const [staff, setStaff] = useState<Profile[]>([]);
  const [creating, setCreating] = useState(false);
  const [tab, setTab] = useState<"welcome" | "tickets" | "open">("welcome");
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
    let q = supabase.from("tickets").select("*").is("archived_at", null).order("updated_at", { ascending: false });
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
      .channel(`tickets-list-${user.id}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tickets" }, () => loadTickets())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "ticket_messages" }, () => loadTickets())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "ticket_messages" }, () => loadTickets())
      .subscribe();
    const interval = window.setInterval(loadTickets, 10_000);
    const onFocus = () => loadTickets();
    const onVis = () => { if (document.visibilityState === "visible") loadTickets(); };
    const onTicketsChanged = () => loadTickets();
    window.addEventListener("focus", onFocus);
    window.addEventListener("tickets:changed", onTicketsChanged);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("tickets:changed", onTicketsChanged);
      document.removeEventListener("visibilitychange", onVis);
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, view]);

  // Load assignable staff list (once, for staff users)
  useEffect(() => {
    if (!isStaff) return;
    (async () => {
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .in("role", ["admin", "management", "staff", "moderator"]);
      const rolesRows = (roles ?? []) as { user_id: string; role: "admin" | "management" | "staff" | "moderator" }[];
      const ids = [...new Set(rolesRows.map((r) => r.user_id))];
      if (!ids.length) return;
      const rank: Record<string, number> = { admin: 4, management: 3, staff: 2, moderator: 1 };
      const topRole = new Map<string, "admin" | "management" | "staff" | "moderator">();
      for (const r of rolesRows) {
        const cur = topRole.get(r.user_id);
        if (!cur || rank[r.role] > rank[cur]) topRole.set(r.user_id, r.role);
      }
      const { data: profs } = await supabase.from("profiles").select("id, display_name, username, avatar_url, equipped_nameplate_id").in("id", ids);
      setStaff(((profs ?? []) as Profile[]).map((p) => ({ ...p, role: topRole.get(p.id) ?? null })));
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
    if (search.id) setTab("tickets");
  }, [search.id]);

  // Deep-link from /mfa-challenge: open the new-ticket form prefilled for a 2FA reset
  useEffect(() => {
    if (search.new2fa === 1 && !creating && !search.id) {
      setCreating(true);
      setTab("open");
    }
  }, [search.new2fa, creating, search.id]);

  const isChatting = selected && tab === "tickets";

  return (
    <main className={cn(
      "flex-1 overflow-y-auto text-white",
      isChatting && "overflow-hidden"
    )}>
      <div className="relative min-h-full bg-rose-950">
        {/* Full-page background image */}
        <div className="pointer-events-none absolute inset-0 z-0">
          <img src={ticketsHero} alt="" aria-hidden className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-br from-rose-700/85 via-fuchsia-700/75 to-violet-800/85" />
          <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-b from-transparent to-rose-950" />
        </div>


      {/* Tabs — hidden when actively chatting on a ticket */}
      <div className={cn(
        "px-6 md:px-10 pb-10 relative z-10 border-t border-white/20",
        !isChatting && "mt-6",
        isChatting && "px-0 md:px-0 pb-0 h-full"
      )}>
        <Tabs value={tab} onValueChange={(v) => setTab(v as "welcome" | "tickets" | "open")}>
          {tab !== "tickets" && (
            <header className="w-full pt-6">
              <div aria-hidden="true" className="mb-6 h-px w-full bg-white/60 shadow-[0_0_12px_rgba(255,255,255,0.55)]" />
              <div className="flex flex-wrap items-center justify-center gap-3 md:gap-4 rounded-3xl bg-white/10 backdrop-blur-xl border border-white/20 shadow-[0_0_50px_-12px_rgba(244,63,94,0.35)] p-3 md:p-4">
                <TabsList className="bg-black/20 border border-white/15 rounded-2xl shadow-inner">
                  <TabsTrigger
                    value="welcome"
                    className="rounded-xl px-5 data-[state=active]:bg-gradient-to-r data-[state=active]:from-rose-500 data-[state=active]:to-fuchsia-500 data-[state=active]:text-white data-[state=active]:shadow-lg"
                  >
                    Welcome
                  </TabsTrigger>
                  <TabsTrigger
                    value="tickets"
                    className="rounded-xl px-5 data-[state=active]:bg-gradient-to-r data-[state=active]:from-rose-500 data-[state=active]:to-fuchsia-500 data-[state=active]:text-white data-[state=active]:shadow-lg"
                  >
                    Tickets
                  </TabsTrigger>
                  <TabsTrigger
                    value="open"
                    onClick={() => setCreating(true)}
                    className="rounded-xl px-5 data-[state=active]:bg-gradient-to-r data-[state=active]:from-rose-500 data-[state=active]:to-fuchsia-500 data-[state=active]:text-white data-[state=active]:shadow-lg"
                  >
                    Open ticket
                  </TabsTrigger>
                </TabsList>

                <div className="inline-flex items-center gap-3 rounded-2xl bg-black/20 backdrop-blur border border-white/15 px-4 py-2.5 shadow-lg">
                  <div className="flex">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Star
                        key={n}
                        className={cn(
                          "size-4",
                          n <= Math.round(avgRating)
                            ? "text-amber-300 fill-amber-300 drop-shadow"
                            : "text-white/30",
                        )}
                      />
                    ))}
                  </div>
                  <div className="text-sm">
                    <span className="font-bold tabular-nums">
                      {ratingCount > 0 ? avgRating.toFixed(1) : "—"}
                    </span>
                    <span className="text-rose-100/90 ml-1.5">
                      {ratingCount > 0
                        ? `from ${ratingCount} customer rating${ratingCount === 1 ? "" : "s"}`
                        : "No ratings yet"}
                    </span>
                  </div>
                </div>

                <ActiveOutagesBox className="bg-black/20 border-white/15 shadow-lg" />
              </div>
            </header>
          )}


          <TabsContent value="welcome" className="mt-6">
            <div className="rounded-2xl bg-gradient-to-br from-rose-600/30 via-fuchsia-600/20 to-violet-700/30 border border-rose-500/30 p-6 md:p-8 lg:p-10 shadow-[0_0_60px_-15px_rgba(244,63,94,0.4)]">
              <div className="flex flex-col lg:flex-row lg:items-start gap-6 lg:gap-8">
                <div className="min-w-0 flex-1">
                  <h2 className="font-display text-2xl md:text-3xl font-bold">Welcome to the Help Desk</h2>
                  <p className="mt-3 text-rose-100/90 max-w-2xl">
                    Account questions, billing, Live TV or Movies & Series issues — we've got you
                    covered. Open a ticket and we'll respond as soon as a staff member is on duty.
                  </p>
                  <p className="mt-5 text-rose-200/80 max-w-2xl text-sm">
                    Once your ticket is resolved, leave a rating so we know how we did.
                  </p>
                </div>
                <div className="w-full lg:w-auto lg:max-w-md shrink-0 [&>div]:px-0 [&>div]:pt-0">
                  <StaffOnDutyStrip variant="tickets" hideRoles={["moderator"]} />
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="open" className={cn("mt-6", isChatting && "mt-0 h-full")}>
            <div className={cn(
              "grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-4",
              isChatting && "h-[calc(100dvh-4rem)] gap-0 lg:grid-cols-[280px_1fr] grid-rows-[auto_1fr] lg:grid-rows-1"
            )}>
              <aside className={cn(
                "rounded-2xl bg-rose-950/50 border border-rose-500/30 p-4 h-fit backdrop-blur space-y-3",
                isChatting && "rounded-none border-y-0 border-l-0 h-full overflow-y-auto hidden lg:block"
              )}>
                <div className="flex gap-1 bg-white/10 p-1 rounded-lg text-xs">
                  <button
                    onClick={() => { setCreating(false); setTab("welcome"); navigate({ to: "/tickets", search: { id: undefined, view } }); }}
                    className="flex items-center justify-center gap-1 px-2 py-1 rounded-md text-white/70 hover:text-white hover:bg-white/10 transition-colors"
                    title="Back to welcome"
                  >
                    <Home className="size-3" />
                  </button>
                </div>
              </aside>

              <div
                ref={detailPanelRef}
                className={cn(
                  "rounded-2xl bg-gradient-to-br from-violet-600 via-fuchsia-600 to-rose-600 text-white relative overflow-hidden min-h-[600px] flex flex-col scroll-mt-16",
                  isChatting ? "h-full rounded-none border-y-0 border-r-0" : "h-[calc(100dvh-8rem)]"
                )}
              >
                <div className="pointer-events-none absolute inset-0 opacity-60" style={{
                  background:
                    "radial-gradient(800px 400px at 0% 0%, rgba(244,63,94,0.45), transparent 60%), radial-gradient(700px 400px at 100% 0%, rgba(168,85,247,0.4), transparent 60%)",
                }} />
                <div className="relative flex-1 flex flex-col min-h-0">
                  <NewTicketForm
                    categories={categories}
                    onCancel={() => { setCreating(false); setTab("tickets"); navigate({ to: "/tickets", search: { id: undefined, view } }); }}
                    onCreated={(id) => { setCreating(false); navigate({ to: "/tickets", search: { id, view } }); }}
                    preset={search.new2fa === 1 ? "2fa-reset" : undefined}
                  />
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="tickets" className={cn("mt-6", isChatting && "mt-0 h-full")}>
            <div className={cn(
              "grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-4",
              isChatting && "h-[calc(100dvh-4rem)] gap-0 lg:grid-cols-[280px_1fr] grid-rows-[auto_1fr] lg:grid-rows-1"
            )}>
              {/* Left list */}
              <aside className={cn(
                "rounded-2xl bg-rose-950/50 border border-rose-500/30 p-4 h-fit backdrop-blur space-y-3",
                isChatting && "rounded-none border-y-0 border-l-0 h-full overflow-y-auto hidden lg:block"
              )}>
                {isChatting && (
                  <div className="flex flex-col sm:flex-row gap-2">
                    <button
                      onClick={() => { setTab("welcome"); navigate({ to: "/tickets", search: { id: undefined, view } }); }}
                      className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-white text-rose-600 text-sm font-semibold hover:bg-white/90 border border-white shadow transition-colors"
                    >
                      <Home className="size-4" /> Welcome
                    </button>
                    <button
                      onClick={() => { navigate({ to: "/tickets", search: { id: undefined, view } }); }}
                      className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-white/10 text-white text-sm font-semibold hover:bg-white/20 border border-white/20"
                    >
                      <X className="size-4" /> Back to list
                    </button>
                  </div>
                )}


                <div className="flex gap-1 bg-white/10 p-1 rounded-lg text-xs">
                  <button
                    onClick={() => { setTab("welcome"); navigate({ to: "/tickets", search: { id: undefined, view } }); }}
                    className="flex items-center justify-center gap-1 px-2 py-1 rounded-md text-white/70 hover:text-white hover:bg-white/10 transition-colors"
                    title="Back to welcome"
                  >
                    <Home className="size-3" />
                  </button>
                  {isStaff && (["mine", "assigned", "all"] as const).map((v) => (
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
                          const when = new Date(t.created_at).toLocaleString("en-GB", {
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
                className={cn(
                  "rounded-2xl bg-gradient-to-br from-violet-600 via-fuchsia-600 to-rose-600 text-white relative overflow-hidden min-h-[600px] flex flex-col scroll-mt-16",
                  isChatting ? "h-full rounded-none border-y-0 border-r-0" : "h-[calc(100dvh-8rem)]"
                )}
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
      </div>
    </main>
  );
}

function NewTicketForm({
  categories: allCategories, onCancel, onCreated, preset,
}: { categories: Category[]; onCancel: () => void; onCreated: (id: string) => void; preset?: "2fa-reset" }) {
  const { user, hasAny } = useAuth();
  // Reporting live TV / movie faults is for paying customers and staff only.
  const hideReportCats =
    hasAny(["member", "nonsubscriber"]) &&
    !hasAny(["subscriber", "staff", "moderator", "management", "admin"]);
  const categories = useMemo(
    () =>
      hideReportCats
        ? allCategories.filter((c) => c.slug !== "live-tv" && c.slug !== "movies-series")
        : allCategories,
    [allCategories, hideReportCats],
  );
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
  const notifyNewTicket = useServerFn(sendNewTicketPush);

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
      const profileUrl = `${window.location.origin}/profile`;
      await supabase.from("ticket_messages").insert({
        ticket_id: t.id,
        sender_id: user!.id,
        content:
          `👋 Welcome to BM Support!\n\nFor account-related questions, your app login details and DNS codes are available on your profile page.\n\n🔗 [Click here to view your Profile & Credentials](${profileUrl})\n\nOr open your avatar menu and go to Profile → Credentials & DNS, then enter your account password and vault PIN to reveal them.\n\nIf you still need help after checking, reply here and a staff member will get back to you.`,
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
    // Fire-and-forget: push (web + FCM) to staff so background/closed
    // browsers and the Android app see the alert even when the page is
    // not in focus.
    void notifyNewTicket({
      data: { ticketId: t.id, subject: parsed.data.subject, categorySlug: cat?.slug },
    }).catch((e) => console.error("[ticket] new ticket push failed", e));
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
        <div className="max-w-6xl mx-auto grid gap-6 lg:grid-cols-[1fr_300px_180px]">
          <div className="space-y-5 min-w-0">
          <Field label="Subject">
            <input
              value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={120}
              placeholder="Briefly describe the issue"
              className="w-full px-3 py-2 rounded-lg bg-white/15 backdrop-blur border border-white/30 focus:border-white text-white placeholder:text-white/60 outline-none"
            />
          </Field>
          <Field label="Message">
            <textarea
              value={message} onChange={(e) => setMessage(e.target.value)} maxLength={2000} rows={6}
              placeholder="Provide as much detail as you can…"
              onPaste={(e) => {
                const imgs = extractImagesFromClipboard(e);
                if (imgs.length) {
                  e.preventDefault();
                  setFiles([...files, ...imgs]);
                  toast.success(`Attached ${imgs.length} pasted image${imgs.length > 1 ? "s" : ""}`);
                }
              }}
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
          <aside className="lg:sticky lg:top-0 lg:self-start">
            <Field label="Category">
              <div className="flex flex-col gap-2">
                {categories.filter((c) => c.slug !== "orders").map((c) => {
                  const Icon = ICONS[c.icon] ?? LifeBuoy;
                  const active = c.id === categoryId;
                  return (
                    <button
                      type="button" key={c.id} onClick={() => setCategoryId(c.id)}
                      className={cn(
                        "flex items-start gap-3 p-3 rounded-lg border text-left transition-colors w-full",
                        active ? "border-white bg-white/25" : "border-white/30 bg-white/10 hover:bg-white/20",
                      )}
                    >
                      <div className="size-9 rounded-lg bg-white/25 grid place-items-center shrink-0"><Icon className="size-4 text-white" /></div>
                      <div className="min-w-0">
                        <div className="font-medium text-sm text-white">{c.name}</div>
                        <div className="text-xs text-white/75 line-clamp-2">{c.description}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </Field>
          </aside>
          <aside className="lg:sticky lg:top-0 lg:self-start">
            <Field label="Priority">
              <div className="flex flex-col gap-2">
                {PRIORITIES.map((p) => (
                  <button
                    type="button" key={p} onClick={() => setPriority(p)}
                    className={cn(
                      "px-3 py-2 rounded-lg text-xs capitalize border w-full text-center",
                      priority === p ? "border-white bg-white/25 text-white" : "border-white/30 text-white/75 hover:text-white",
                    )}
                  >{p}</button>
                ))}
              </div>
            </Field>
          </aside>
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
  // Sales tickets (linked to an order) are admin/management only — never hand
  // them to other staff roles.
  const isSalesTicket = !!ticket.order_id;
  const assignableStaff = useMemo(
    () => (isSalesTicket ? staff.filter((s) => s.role === "admin" || s.role === "management") : staff),
    [isSalesTicket, staff],
  );



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
  const participantIds = useMemo(() => {
    const ids = new Set<string>();
    ids.add(ticket.user_id);
    if (ticket.assigned_to) ids.add(ticket.assigned_to);
    for (const m of messages) if (m.sender_id) ids.add(m.sender_id);
    ids.delete(currentUserId);
    return [...ids];
  }, [ticket.user_id, ticket.assigned_to, messages, currentUserId]);
  const mention = useMentionAutocomplete({
    value: draft,
    onChange: setDraft,
    textareaRef: taRef,
    canBroadcast: false,
    allowedUserIds: participantIds,
  });
  const channelJump = useChannelJump({ value: draft, onChange: setDraft, editorRef: taRef });
  const [myUsername, setMyUsername] = useState<string | null>(null);
  useEffect(() => {
    supabase
      .from("profiles")
      .select("username")
      .eq("id", currentUserId)
      .maybeSingle()
      .then(({ data }) => setMyUsername(data?.username ?? null));
  }, [currentUserId]);

  // Linked order (for Orders-category tickets) — lets the customer pay
  // for the order directly from inside the ticket.
  type LinkedOrder = {
    id: string;
    user_id: string | null;
    total_cents: number;
    status: string;
    paid_at: string | null;
    completed_at: string | null;
    customer_type: string | null;
    existing_username: string | null;
  };
  const [linkedOrder, setLinkedOrder] = useState<LinkedOrder | null>(null);
  const [linkedOrderUsername, setLinkedOrderUsername] = useState<string | null>(null);
  const [orderBusy, setOrderBusy] = useState(false);
  const [payCheckPhase, setPayCheckPhase] = useState<PayCheckPhase | null>(null);
  const [payProvider, setPayProvider] = useState<
    "stripe" | "square" | "nowpayments" | "bank_transfer" | null
  >(null);
  const [bankAwaiting, setBankAwaiting] = useState(false);
  const [bankOnlyOrder, setBankOnlyOrder] = useState(false);
  const checkOrderBankAccess = useServerFn(getOrderBankTransferAccess);
  useEffect(() => {
    let alive = true;
    if (!ticket.order_id) { setBankOnlyOrder(false); return; }
    (async () => {
      const res: any = await checkOrderBankAccess({ data: { orderId: ticket.order_id as string } }).catch(() => null);
      if (alive) setBankOnlyOrder(Boolean(res?.allowed));
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticket.order_id]);
  const checkPaymentAcrossProviders = useServerFn(checkOrderPaymentAcrossProviders);
  const cancelOrderAndSquareInvoiceRpc = useServerFn(cancelOrderAndSquareInvoice);
  const getPaymentState = useServerFn(getOrderPaymentState);
  const applyOrderToCredentialFn = useServerFn(applyOrderToCredential);
  const createCredentialForOrderFn = useServerFn(createCredentialForOrder);
  const [credPicker, setCredPicker] = useState<{ candidates: CredentialCandidate[]; months: number } | null>(null);
  const [newCred, setNewCred] = useState<{
    months: number;
    accountType: "single" | "multi" | "triple";
    loginName: string;
    password: string;
    existingCount: number;
  } | null>(null);
  const [newCredBusy, setNewCredBusy] = useState(false);

  const loadLinkedOrder = async () => {
    if (!ticket.order_id) { setLinkedOrder(null); setLinkedOrderUsername(null); return; }
    const { data } = await supabase
      .from("orders")
      .select("id,user_id,total_cents,status,paid_at,completed_at,customer_type,existing_username")
      .eq("id", ticket.order_id)
      .maybeSingle();
    let ord = data ? (data as LinkedOrder) : null;
    if (ord) {
      const paymentState = await getPaymentState({ data: { orderId: ord.id } }).catch(() => null);
      let prov = paymentState?.provider ?? null;
      let settled = Boolean(paymentState?.settled);
      let settledAt = paymentState?.paidAt ?? null;
      // Fallback: read the payment row directly if the server check failed, so
      // the payment status box still appears for a paid order.
      if (!paymentState) {
        const { data: pay } = await supabase
          .from("order_payments")
          .select("provider,status,amount_cents")
          .eq("order_id", ord.id)
          .maybeSingle();
        const p = pay as { provider: string | null; status: string | null; amount_cents: number | null } | null;
        if (p) {
          prov = p.provider ?? null;
          settled =
            isSettledPaymentStatus(p.status) &&
            Number(p.amount_cents ?? -1) === Number(ord.total_cents ?? 0);
        }
      }
      if (settled && !ord.paid_at) {
        ord = { ...ord, paid_at: settledAt ?? new Date().toISOString(), status: "paid" };
      }
      setPayProvider(
        prov === "stripe" || prov === "square" || prov === "nowpayments" || prov === "bank_transfer"
          ? prov
          : null,
      );
      setBankAwaiting(
        prov === "bank_transfer" &&
          String(paymentState?.paymentStatus ?? "").toLowerCase() === "awaiting_verification" &&
          !settled,
      );
    }

    setLinkedOrder(ord);
    if (ord?.user_id) {
      const { data: prof } = await supabase
        .from("profiles")
        .select("username")
        .eq("id", ord.user_id)
        .maybeSingle();
      setLinkedOrderUsername((prof as { username?: string | null } | null)?.username ?? null);
    } else {
      setLinkedOrderUsername(null);
    }
  };
  useEffect(() => { loadLinkedOrder(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [ticket.order_id, getPaymentState]);
  // Live-refresh the order panel when the order or its payment changes, so
  // "Payment received" appears without a hard refresh.
  useEffect(() => {
    const orderId = ticket.order_id;
    if (!orderId) return;
    const ch = supabase
      .channel(`ticket-order-${orderId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders", filter: `id=eq.${orderId}` },
        () => { void loadLinkedOrder(); },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "order_payments", filter: `order_id=eq.${orderId}` },
        () => { void loadLinkedOrder(); },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticket.order_id]);

  const orderIsUnpaid = !!linkedOrder && !linkedOrder.paid_at && linkedOrder.status !== "cancelled" && linkedOrder.status !== "refunded" && linkedOrder.status !== "completed";
  const accountSetupMessageExists = messages.some((m) => (m.content ?? "").startsWith("🛠️"));
  const extendSubMessageExists = messages.some((m) => (m.content ?? "").startsWith("🔄"));
  const accountSetupDoneExists = messages.some((m) => (m.content ?? "").startsWith("🟢"));
  const accountSetupStarted = accountSetupMessageExists || extendSubMessageExists;


  const postTicketSystem = async (content: string) => {
    if (!currentUserId) return;
    const { error } = await supabase.from("ticket_messages").insert({
      ticket_id: ticket.id,
      sender_id: currentUserId,
      content,
    });
    if (!error) {
      await load();
      notifyTicketChanged();
    }
  };

  const confirmBankTransferFn = useServerFn(confirmBankTransferReceived);
  const orderConfirmBankTransfer = async () => {
    if (!linkedOrder || orderBusy) return;
    setOrderBusy(true);
    try {
      await confirmBankTransferFn({ data: { orderId: linkedOrder.id } });
      await postTicketSystem(
        `✅ Bank transfer received — your payment of ${(linkedOrder.total_cents / 100).toLocaleString("en-GB", { style: "currency", currency: "GBP" })} has landed in our account and your order is now marked as paid.\n\n🙏 Thank you for the transfer — we really appreciate it. We'll get your account sorted and keep you updated here.`,
      );
      await loadLinkedOrder();
      toast.success("Bank transfer confirmed");
    } catch (e: any) {
      toast.error(e?.message ?? "Could not confirm payment");
    } finally { setOrderBusy(false); }
  };

  const orderSettingUpAccount = async () => {
    if (!linkedOrder || orderBusy) return;
    if (linkedOrder.status === "completed" || linkedOrder.completed_at) {
      toast.error("This order is completed and cannot be changed.");
      return;
    }
    setOrderBusy(true);
    try {
      await postTicketSystem(
        `🛠️ We are currently setting up your account. Your login details will appear in the Credentials section of your profile soon.`,
      );

      toast.success("Customer notified");
    } finally { setOrderBusy(false); }
  };

  const orderAccountSetupDone = async () => {
    if (!linkedOrder || orderBusy) return;
    setOrderBusy(true);
    try {
      const profileLink = linkedOrderUsername
        ? `\n\n🔗 [Click here to view your Credentials](${window.location.origin}/u/${linkedOrderUsername}?tab=creds)`
        : "";
      await postTicketSystem(
        `🟢 Your account is now set up and ready to use! Your login details are available in the Credentials section of your profile.${profileLink}`,
      );
      toast.success("Account setup confirmed");
    } finally { setOrderBusy(false); }
  };

  const orderExtendSubscription = async () => {

    if (!linkedOrder || orderBusy) return;
    if (linkedOrder.status === "completed" || linkedOrder.completed_at) {
      toast.error("This order is completed and cannot be changed.");
      return;
    }
    setOrderBusy(true);
    try {
      const handle = linkedOrder.existing_username ? ` for “${linkedOrder.existing_username}”` : "";
      await postTicketSystem(
        `🔄 Your subscription${handle} is being updated. You'll receive confirmation once the extension is complete.`,
      );
      toast.success("Customer notified");
    } finally { setOrderBusy(false); }
  };

  const orderCompleteSale = async () => {
    if (!linkedOrder || orderBusy) return;
    if (linkedOrder.status === "completed" || linkedOrder.completed_at) return;
    setOrderBusy(true);
    try {
      const { error } = await supabase.from("orders").update({
        completed_at: new Date().toISOString(),
        completed_by: currentUserId ?? null,
        status: "completed",
      } as never).eq("id", linkedOrder.id);
      if (error) { toast.error(error.message); return; }
      // Ensure the customer ends up with the `subscriber` role only.
      // Staff roles (admin/management/staff/moderator) are protected and
      // kept alongside subscriber; everything else is removed.
      if (linkedOrder.user_id) {
        const PROTECTED = ["admin", "management", "staff", "moderator"];
        const { data: existingRoles } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", linkedOrder.user_id);
        const roles = (existingRoles ?? []).map((r) => String((r as { role: string }).role));
        const toRemove = roles.filter((r) => r !== "subscriber" && !PROTECTED.includes(r));
        if (toRemove.length > 0) {
          const { error: delErr } = await supabase
            .from("user_roles")
            .delete()
            .eq("user_id", linkedOrder.user_id)
            .in("role", toRemove as never[]);
          if (delErr) toast.error(`Couldn't clean up roles: ${delErr.message}`);
        }
        if (!roles.includes("subscriber")) {
          const { error: roleErr } = await supabase
            .from("user_roles")
            .insert({ user_id: linkedOrder.user_id, role: "subscriber" } as never);
          if (roleErr && !/duplicate|unique/i.test(roleErr.message)) {
            toast.error(`Couldn't grant subscriber role: ${roleErr.message}`);
          }
        }
      }
      await postTicketSystem(
        `🎉 Your account has been upgraded — thank you for your business! We really appreciate it.`,
      );
      toast.success("Sale completed");
      await loadLinkedOrder();
      await applyRenewal();
    } finally { setOrderBusy(false); }
  };

  /**
   * Extends the customer's credential by the months purchased and sets the
   * account type from the products bought. Called automatically on Sale
   * Complete; re-called with a chosen account when the customer has several.
   */
  const applyRenewal = async (credentialId?: string) => {
    if (!linkedOrder) return;
    try {
      const res = await applyOrderToCredentialFn({
        data: { orderId: linkedOrder.id, ...(credentialId ? { credentialId } : {}) },
      });
      handleFulfilResult(res);
    } catch (e: any) {
      toast.error(e?.message ?? "Couldn't update the account expiry");
    }
  };

  const handleFulfilResult = async (res: ApplyOrderResult) => {
    if (res.status === "needs_selection") {
      setCredPicker({ candidates: res.candidates, months: res.months });
      toast.warning("Choose which account to extend");
      return;
    }
    if (res.status === "needs_new_credentials") {
      setNewCred({
        months: res.months,
        accountType: res.accountType ?? "single",
        loginName: "",
        password: "",
        existingCount: res.existingAccounts.length,
      });
      toast.warning("Enter the login name and password for the new account");
      return;
    }
    if (res.status === "no_term") {
      toast.warning("Couldn't work out the subscription length from this order — set the expiry manually.");
      return;
    }
    setCredPicker(null);
    setNewCred(null);
    const expiry = new Date(res.newExpiry).toLocaleDateString("en-GB", {
      day: "numeric", month: "short", year: "numeric",
    });
    toast.success(
      `${res.created ? "Account created" : res.accountLabel}: ${res.months} month${res.months === 1 ? "" : "s"} → expires ${expiry}`,
    );
    await postTicketSystem(
      res.created
        ? `🆕 Account set up — ${res.accountLabel} (${res.accountTypeLabel}), ${res.months} month${res.months === 1 ? "" : "s"}, expires ${expiry}. Your login details are in My Account.`
        : `📅 Subscription updated — ${res.accountLabel} (${res.accountTypeLabel}) now runs for a further ${res.months} month${res.months === 1 ? "" : "s"} and expires on ${expiry}.`,
    );
  };

  const submitNewCredential = async () => {
    if (!linkedOrder || !newCred) return;
    if (!newCred.loginName.trim() || !newCred.password.trim()) {
      toast.error("Login name and password are required");
      return;
    }
    setNewCredBusy(true);
    try {
      const res = await createCredentialForOrderFn({
        data: {
          orderId: linkedOrder.id,
          loginName: newCred.loginName.trim(),
          password: newCred.password,
          accountType: newCred.accountType,
        },
      });
      await handleFulfilResult(res);
    } catch (e: any) {
      toast.error(e?.message ?? "Couldn't create the account");
    } finally {
      setNewCredBusy(false);
    }
  };




  const orderCancel = async () => {
    if (!linkedOrder || orderBusy) return;
    if (linkedOrder.status === "completed" || !!linkedOrder.completed_at || !!linkedOrder.paid_at) {
      toast.error("This order can no longer be cancelled.");
      return;
    }
    if (linkedOrder.status === "cancelled") return;
    if (!confirm("Cancel this order? This cannot be undone.")) return;
    setOrderBusy(true);
    try {
      const result = await cancelOrderAndSquareInvoiceRpc({ data: { orderId: linkedOrder.id } });
      await postTicketSystem(
        `🚫 Order cancelled by ${linkedOrder.user_id === currentUserId ? "customer" : "staff"}.`
      );
      toast.success("Order cancelled");
      if (result.invoiceCancelled) {
        await postTicketSystem(`🚫 Square invoice cancelled.`);
      } else if (result.invoiceError && !/No Square invoice|PAID/i.test(result.invoiceError)) {
        toast.warning("Order cancelled, but the Square invoice could not be cancelled automatically.");
      }
      await loadLinkedOrder();
      window.dispatchEvent(new CustomEvent("orders:changed", { detail: { orderId: linkedOrder.id, status: "cancelled" } }));
    } finally { setOrderBusy(false); }
  };

  const orderRefreshSquareStatus = async () => {
    if (!linkedOrder || orderBusy || linkedOrder.paid_at) return;
    setOrderBusy(true);
    setPayCheckPhase("checking_stripe");
    try {
      // One check that interrogates every provider the customer can pay with.
      const res = await checkPaymentAcrossProviders({ data: { orderId: linkedOrder.id } });
      await loadLinkedOrder();

      if (res.paid) {
        setPayCheckPhase("confirmed");
        if (res.status === "paid") {
          await postTicketSystem(
            `✅ Payment received${res.provider ? ` via ${res.provider}` : ""} — thank you! Your order is now marked as paid.`,
          );
        }
        toast.success(res.detail || "Payment confirmed — order marked paid");
      } else {
        setPayCheckPhase("failed");
        toast.message(res.detail);
      }
    } catch (e) {
      setPayCheckPhase("failed");
      toast.error((e as Error).message || "Failed to refresh payment status");
    } finally { setOrderBusy(false); }
  };

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
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "ticket_messages", filter: `ticket_id=eq.${ticket.id}` },
        (p) => {
          const nm = p.new as unknown as Message;
          setMessages((m) => m.map((x) => (x.id === nm.id ? { ...x, ...nm } : x)));
        })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "ticket_messages", filter: `ticket_id=eq.${ticket.id}` },
        (p) => {
          const oldId = (p.old as { id?: string } | undefined)?.id;
          if (oldId) setMessages((m) => m.filter((x) => x.id !== oldId));
        })
      .on("postgres_changes", { event: "*", schema: "public", table: "tickets", filter: `id=eq.${ticket.id}` }, () => {
        void load();
      })
      .on("broadcast", { event: "message_changed" }, (payload) => {
        const d = (payload?.payload ?? {}) as { ticketId?: string; senderId?: string };
        if (d.ticketId !== ticket.id || d.senderId === currentUserId) return;
        void load();
        window.dispatchEvent(new CustomEvent("tickets:changed", { detail: { ticketId: ticket.id } }));
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
        if (status === "SUBSCRIBED") load();
      });
    channelRef.current = ch;
    const reconcile = window.setInterval(load, 2_000);
    const onFocus = () => load();
    const onVis = () => { if (document.visibilityState === "visible") load(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      typingChannelReadyRef.current = false;
      channelRef.current = null;
      if (typingTimerRef.current) { window.clearTimeout(typingTimerRef.current); typingTimerRef.current = null; }
      window.clearInterval(reconcile);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
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

  function notifyTicketChanged() {
    window.dispatchEvent(new CustomEvent("tickets:changed", { detail: { ticketId: ticket.id } }));
    if (!channelRef.current || !typingChannelReadyRef.current) return;
    void channelRef.current.send({
      type: "broadcast",
      event: "message_changed",
      payload: { ticketId: ticket.id, senderId: currentUserId, at: Date.now() },
    });
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

  const notifyStaffOfCustomerReplyFn = useServerFn(notifyStaffOfCustomerReply);
  const send = async () => {
    const content = draft.trim();
    if ((content.length < 1 && replyFiles.length === 0) || content.length > 2000) return;
    if (ticket.status === "closed") return toast.error("Ticket is closed");
    setSending(true);
    const uploaded = replyFiles.length ? await uploadTicketFiles(replyFiles, currentUserId, setReplyProgress) : [];
    setReplyProgress(null);
    const isInternal = internal && isStaff;
    const { data: inserted, error } = await supabase.from("ticket_messages").insert({
      ticket_id: ticket.id, sender_id: currentUserId, content, is_internal: isInternal,
      attachments: uploaded as unknown as never,
    }).select("id").maybeSingle();
    setSending(false);
    if (error) {
      const msg = error.message;
      return toast.error(
        msg.includes("@all") || msg.includes("@here")
          ? "Only owner and management can use @all or @here."
          : msg,
      );
    }
    setDraft("");
    draftRef.current = "";
    if (typingTimerRef.current) { window.clearTimeout(typingTimerRef.current); typingTimerRef.current = null; }
    sendTyping(true);
    setReplyFiles([]);
    await load();
    notifyTicketChanged();
    // Email the ticket owner when a staff member posts a public reply.
    if (isStaff && !isInternal && ticket.user_id !== currentUserId && inserted?.id) {
      try {
        await notifyTicketReply({ data: { ticketId: ticket.id, messageId: inserted.id } });
      } catch (e) {
        console.warn("[tickets] notifyTicketReply failed", e);
      }
    }
    // Customer replied — alert the assigned staff member (chime + popup).
    if (!isStaff && ticket.user_id === currentUserId && inserted?.id) {
      try {
        await notifyStaffOfCustomerReplyFn({ data: { ticketId: ticket.id, messageId: inserted.id } });
      } catch (e) {
        console.warn("[tickets] notifyStaffOfCustomerReply failed", e);
      }
    }
    // Bump updated_at via status touch (only staff allowed) — skip for users
    if (isStaff && ticket.status === "open") {
      await supabase.from("tickets").update({ status: "in_progress" }).eq("id", ticket.id);
    }
  };

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const canEditMessage = (m: Message) => isAdmin || m.sender_id === currentUserId;
  const startEdit = (m: Message) => { setEditingId(m.id); setEditDraft(m.content); };
  const saveEdit = async (m: Message) => {
    const content = editDraft.trim();
    if (!content) return toast.error("Message can't be empty");
    const { error } = await supabase
      .from("ticket_messages")
      .update({ content, edited_at: new Date().toISOString() } as never)
      .eq("id", m.id);
    if (error) return toast.error(error.message);
    setEditingId(null);
    setEditDraft("");
    await load();
    toast.success("Reply updated");
  };

  const updateField = async (patch: Partial<Pick<Ticket, "status" | "priority" | "assigned_to">>) => {
    const closing = patch.status === "closed" || patch.status === "resolved";
    const { error } = await supabase
      .from("tickets")
      .update({ ...patch, ...(closing ? { closed_at: new Date().toISOString() } : {}) })
      .eq("id", ticket.id);
    if (error) toast.error(error.message);
  };

  // Assignee changes go through the server helper: a DB trigger blocks
  // overwriting an existing assignee with a plain update, so picking a new
  // owner (including taking the ticket back yourself) must be reassigned
  // properly and logged on the thread.
  const handOverFn = useServerFn(handOverTicket);
  const changeAssignee = async (v: string) => {
    if (v === (ticket.assigned_to ?? "")) return;
    if (!v) return updateField({ assigned_to: null });
    if (!ticket.assigned_to) return updateField({ assigned_to: v });
    try {
      const res = await handOverFn({ data: { ticketId: ticket.id, toUserId: v } });
      if (!res?.ok) return toast.error(res?.reason ? `Couldn't reassign: ${res.reason}` : "Couldn't reassign");
      toast.success(res.tookBack ? "You've taken this ticket back" : `Ticket passed to ${res.toName ?? "staff"}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Reassign failed");
    }
  };

  const closeTicket = async () => {
    if (ticket.status === "closed") return;
    if (!confirm("Close this ticket?")) return;
    const { error } = await supabase.rpc("close_ticket", { _ticket_id: ticket.id });
    if (error) return toast.error(error.message);
    toast.success("Ticket closed");
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

  const chatRoleFlashMap = useRoleFlashMap();
  const [senderMeta, setSenderMeta] = useState<
    Record<string, { avatar_url: string | null; equipped_nameplate_id: string | null }>
  >({});
  useEffect(() => {
    const ids = [...new Set(messages.map((m) => m.sender_id))].filter((id) => !senderMeta[id]);
    if (!ids.length) return;
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id,avatar_url,equipped_nameplate_id")
        .in("id", ids);
      if (!alive || !data) return;
      setSenderMeta((prev) => {
        const next = { ...prev };
        for (const p of data as Array<{ id: string; avatar_url: string | null; equipped_nameplate_id: string | null }>) {
          next[p.id] = { avatar_url: p.avatar_url, equipped_nameplate_id: p.equipped_nameplate_id };
        }
        return next;
      });
    })();
    return () => { alive = false; };
  }, [messages, senderMeta]);


  const orderPanelInner = linkedOrder ? (
    <div className="space-y-2 text-white text-xs">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="font-semibold">Order #{linkedOrder.id.slice(0, 8)}</div>
          <div className="opacity-80">
            Status: {linkedOrder.status}
            {linkedOrder.paid_at ? " · Paid" : ""}
          </div>
        </div>
        <div className="text-right font-semibold">
          {(linkedOrder.total_cents / 100).toLocaleString("en-GB", { style: "currency", currency: "GBP" })}
        </div>
      </div>
      <OrderProgressStrip
        order={linkedOrder}
        bankTransfer={payProvider === "bank_transfer" || bankOnlyOrder}
        transferReported={bankAwaiting}
      />
      <PaymentStatusTimeline
        phase={
          linkedOrder.status === "cancelled"
            ? "cancelled"
            : linkedOrder.paid_at || linkedOrder.status === "paid" || linkedOrder.status === "processing" || linkedOrder.status === "completed"
              ? "confirmed"
              : bankAwaiting
                ? "awaiting_verification"
                : (payCheckPhase ?? "awaiting")
        }
        method={payProvider ?? (bankOnlyOrder ? "bank_transfer" : null)}
        started
      />

      {orderIsUnpaid && linkedOrder.user_id === currentUserId ? (
        <div className="[&>button]:!bg-gradient-to-r [&>button]:!from-emerald-400 [&>button]:!via-emerald-500 [&>button]:!to-emerald-600 [&>button]:!text-white [&>button]:!font-bold [&>button]:!text-base [&>button]:!py-3.5 [&>button]:!rounded-xl [&>button]:!shadow-[0_10px_30px_-8px_rgba(16,185,129,0.7),0_0_0_1px_rgba(255,255,255,0.15)_inset] [&>button]:!ring-2 [&>button]:!ring-emerald-300/60 [&>button]:hover:!brightness-110 [&>button]:hover:!shadow-[0_14px_40px_-8px_rgba(16,185,129,0.9),0_0_0_1px_rgba(255,255,255,0.2)_inset] [&>button]:!transition-all [&>button]:!tracking-wide [&>button]:animate-[pulse_2.4s_ease-in-out_infinite] [&>button>svg]:!size-5">
          <PayOrderDialog
            orderId={linkedOrder.id}
            amountCents={linkedOrder.total_cents}
            onChange={loadLinkedOrder}
          />
          {!bankOnlyOrder && (
            <button
              type="button"
              onClick={orderRefreshSquareStatus}
              disabled={orderBusy}
              className="mt-2 w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white/15 border border-white/25 text-white text-sm font-bold hover:bg-white/25 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              <CheckCircle2 className="size-4" />
              {orderBusy ? "Checking payment…" : "I've paid — refresh status"}
            </button>
          )}
        </div>
      ) : linkedOrder.paid_at ? (
        <div className="text-emerald-200">✓ Payment received — thank you!</div>
      ) : null}
      {!linkedOrder.completed_at && linkedOrder.status !== "cancelled" && (
        <div className="flex flex-wrap gap-2 pt-1">
          {!linkedOrder.paid_at && linkedOrder.user_id === currentUserId && (
            <button
              onClick={orderCancel}
              disabled={orderBusy || bankAwaiting}
              title={
                bankAwaiting
                  ? "Bank transfer reported — cannot cancel while we verify your payment"
                  : "Cancel your order"
              }
              className="px-2.5 py-1 rounded-md bg-red-500/20 text-red-50 text-xs font-medium flex items-center gap-1 hover:bg-red-500/30 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Ban className="size-3.5" /> Cancel Order
            </button>
          )}
          {isAdmin && (
            <>
              {!linkedOrder.paid_at && (bankOnlyOrder || payProvider === "bank_transfer") && (
                <button
                  onClick={orderConfirmBankTransfer}
                  disabled={orderBusy}
                  title="Tick once the money has landed in the bank — confirms payment and thanks the customer"
                  className="px-2.5 py-1 rounded-md bg-emerald-500/25 border border-emerald-300/50 text-emerald-50 text-xs font-semibold inline-flex items-center gap-1 hover:bg-emerald-500/40 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <CheckCircle2 className="size-3.5 text-emerald-300" />
                  {orderBusy ? "Confirming…" : "Confirm Bank Transfer Received"}
                </button>
              )}
              {linkedOrder.customer_type === "existing" &&
              Boolean((linkedOrder as { existing_username?: string | null }).existing_username) ? (
                <button
                  onClick={orderExtendSubscription}
                  disabled={orderBusy || !linkedOrder.paid_at || extendSubMessageExists}
                  title={
                    !linkedOrder.paid_at
                      ? "Waiting for payment confirmation"
                      : extendSubMessageExists
                        ? "Subscription extension already sent"
                        : undefined
                  }
                  className="px-2.5 py-1 rounded-md bg-violet-500/20 text-violet-50 text-xs font-medium hover:bg-violet-500/30 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  🔄 Extend Subscription
                </button>
              ) : (
                <>
                  <button
                    onClick={orderSettingUpAccount}
                    disabled={orderBusy || !linkedOrder.paid_at || accountSetupMessageExists}
                    title={
                      !linkedOrder.paid_at
                        ? "Waiting for payment confirmation"
                        : accountSetupMessageExists
                          ? "Account setup already sent"
                          : undefined
                    }
                    className="px-2.5 py-1 rounded-md bg-blue-500/20 text-blue-50 text-xs font-medium hover:bg-blue-500/30 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    🛠️ Setting Up Account
                  </button>
                  <button
                    onClick={orderAccountSetupDone}
                    disabled={orderBusy || !linkedOrder.paid_at || accountSetupDoneExists}
                    title={
                      !linkedOrder.paid_at
                        ? "Waiting for payment confirmation"
                        : accountSetupDoneExists
                          ? "Account setup already confirmed"
                          : "Tick once the account is set up — notifies the customer"
                    }
                    className={cn(
                      "px-2.5 py-1 rounded-md text-xs font-semibold inline-flex items-center gap-1 border transition disabled:cursor-not-allowed",
                      accountSetupDoneExists
                        ? "bg-emerald-500/40 border-emerald-300/60 text-emerald-50 opacity-100"
                        : "bg-emerald-500/20 border-emerald-300/40 text-emerald-50 hover:bg-emerald-500/35 disabled:opacity-40",
                    )}
                  >
                    <CheckCircle2 className="size-3.5 text-emerald-300" />
                    {accountSetupDoneExists ? "Account Set Up ✓" : "Account Set Up"}
                  </button>
                </>
              )}

              <button
                onClick={orderCompleteSale}
                disabled={orderBusy || !linkedOrder.paid_at || !accountSetupStarted || !!linkedOrder.completed_at}
                title={
                  !linkedOrder.paid_at
                    ? "Waiting for payment confirmation"
                    : !accountSetupStarted
                      ? (linkedOrder.customer_type === "existing"
                          ? "Extend subscription first"
                          : "Set up account first")
                      : !!linkedOrder.completed_at
                        ? "Sale already completed"
                        : undefined
                }
                className="px-2.5 py-1 rounded-md bg-emerald-500/25 text-emerald-50 text-xs font-medium hover:bg-emerald-500/35 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                ✅ Sale Complete
              </button>
            </>
          )}
        </div>
      )}

      <Dialog open={!!credPicker} onOpenChange={(o) => { if (!o) setCredPicker(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Which account should be extended?</DialogTitle>
            <DialogDescription>
              This customer has more than one account. Pick the one to extend by{" "}
              {credPicker?.months ?? 0} month{(credPicker?.months ?? 0) === 1 ? "" : "s"}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {(credPicker?.candidates ?? []).map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => applyRenewal(c.id)}
                className="w-full text-left px-3 py-2.5 rounded-lg border border-border hover:bg-accent transition"
              >
                <div className="font-semibold text-sm">
                  {c.app_login_name?.trim() || `Account ${c.account_number ?? "?"}`}
                </div>
                <div className="text-xs text-muted-foreground">
                  {c.account_type ? `${c.account_type} · ` : ""}
                  {c.expiry_at
                    ? `expires ${new Date(c.expiry_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`
                    : "no expiry set"}
                </div>
              </button>
            ))}
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            <Button
              variant="outline"
              onClick={() => {
                const months = credPicker?.months ?? 0;
                const count = credPicker?.candidates.length ?? 0;
                setCredPicker(null);
                setNewCred({ months, accountType: "single", loginName: "", password: "", existingCount: count });
              }}
            >
              Add a new account instead
            </Button>
            <Button variant="ghost" onClick={() => setCredPicker(null)}>Skip for now</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New / additional account: staff enters the login details */}
      <Dialog open={!!newCred} onOpenChange={(o) => { if (!o && !newCredBusy) setNewCred(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {(newCred?.existingCount ?? 0) > 0 ? "Set up the additional account" : "Set up the new account"}
            </DialogTitle>
            <DialogDescription>
              Enter the login name and password for this customer. The expiry will be set to{" "}
              {newCred?.months ?? 0} month{(newCred?.months ?? 0) === 1 ? "" : "s"} from today and the account will
              appear in the admin credentials list.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="newcred-login">Login name</Label>
              <Input
                id="newcred-login"
                autoComplete="off"
                value={newCred?.loginName ?? ""}
                onChange={(e) => setNewCred((p) => (p ? { ...p, loginName: e.target.value } : p))}
                placeholder="e.g. jsmith01"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="newcred-pass">Password</Label>
              <Input
                id="newcred-pass"
                autoComplete="off"
                value={newCred?.password ?? ""}
                onChange={(e) => setNewCred((p) => (p ? { ...p, password: e.target.value } : p))}
                placeholder="Account password"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Account type</Label>
              <div className="grid grid-cols-3 gap-2">
                {(["single", "multi", "triple"] as const).map((t) => (
                  <Button
                    key={t}
                    type="button"
                    variant={newCred?.accountType === t ? "default" : "outline"}
                    size="sm"
                    onClick={() => setNewCred((p) => (p ? { ...p, accountType: t } : p))}
                  >
                    {t === "single" ? "Single" : t === "multi" ? "Multi-room" : "Triple-room"}
                  </Button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" disabled={newCredBusy} onClick={() => setNewCred(null)}>Skip for now</Button>
            <Button onClick={submitNewCredential} disabled={newCredBusy}>
              {newCredBusy ? "Creating…" : "Create account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  ) : null;


  return (
    <div className="flex-1 flex flex-col lg:flex-row min-h-0">
      <div className="flex-1 flex flex-col min-h-0">
      <header className="border-b border-white/20 px-3 sm:px-5 py-2 sm:py-3 space-y-2 sm:space-y-3 bg-white/5 backdrop-blur">
        <div className="flex flex-wrap sm:flex-nowrap items-start sm:items-center gap-2 sm:gap-3">
          <div className="hidden sm:grid size-9 shrink-0 rounded-lg bg-white/25 place-items-center"><CatIcon className="size-4 text-white" /></div>
          <div className="min-w-0 flex-1">
            <div className="hidden sm:flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-white/80">
              <span>{cat?.name ?? "—"}</span>
              <span>·</span>
              <span>Opened by {senderName(ticket.user_id)}</span>
              <span>·</span>
              <span>{new Date(ticket.created_at).toLocaleDateString("en-GB", { timeZone: tz })}</span>
            </div>
            <h1 className="font-display font-semibold text-base sm:text-lg truncate text-white drop-shadow">{ticket.subject}</h1>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white/25 text-xs text-white">
              <StatusIcon className="size-3" /> {STATUS_META[ticket.status].label}
            </span>
            {ticket.status !== "closed" && (isStaff || ticket.user_id === currentUserId) && (
              <button
                onClick={closeTicket}
                title="Close ticket"
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white/90 text-rose-600 hover:bg-white text-xs font-semibold shadow"
              >
                <XCircle className="size-3" /> Close ticket
              </button>
            )}

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
        </div>
        {linkedOrder && (
          <div className="lg:hidden rounded-lg border border-white/25 bg-white/10 backdrop-blur p-3 max-h-[55vh] overflow-y-auto overscroll-contain">
            {orderPanelInner}
          </div>
        )}
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
              options={[{ value: "", label: "Unassigned" }, ...assignableStaff.map((s) => ({ value: s.id, label: s.display_name || s.username || "Staff" }))]}
              onChange={(v) => void changeAssignee(v)}
            />
            {ticket.assigned_to && (() => {
              const a = staff.find((s) => s.id === ticket.assigned_to);
              if (!a) return null;
              return <StaffIdCard profile={a} />;
            })()}
            {ticket.assigned_to && ticket.assigned_to !== currentUserId && (
              <button
                type="button"
                onClick={() => void changeAssignee(currentUserId)}
                title="Take control of this ticket back"
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-300 text-emerald-950 hover:bg-emerald-200 text-xs font-semibold shadow"
              >
                <Forward className="size-3.5 rotate-180" /> Take back
              </button>
            )}
            <RequestAdminHelpButton ticketId={ticket.id} />
            <HandOverTicketButton
              ticketId={ticket.id}
              staff={assignableStaff}
              currentUserId={currentUserId}
            />

            <QuickRepliesPill
              scope="ticket"
              label="Staff shortcuts"
              onInsert={(text) => onDraftChange(draftRef.current ? `${draftRef.current} ${text}` : text)}
            />
            <span className={cn("ml-auto px-2 py-1 rounded text-xs capitalize", PRI_CLS[ticket.priority])}>{ticket.priority}</span>
          </div>
        )}
      </header>

      <RatingPromptDialog
        ticket={ticket}
        currentUserId={currentUserId}
        myRating={myRating}
        onRate={onRate}
      />

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 sm:px-5 py-3 sm:py-4">
        {messages.map((m) => {
          const name = senderName(m.sender_id);
          const meta = senderMeta[m.sender_id];
          const role = chatRoleFlashMap.get(m.sender_id);
          const avatarUrl = resolveAvatarUrl(m.sender_id, meta?.avatar_url ?? null, chatRoleFlashMap);
          const hasAvatar = !!meta?.avatar_url || role === "staff" || role === "management" || role === "moderator";
          return (
            <div key={m.id} className="group relative flex items-start gap-3 rounded-xl mb-4">
              {hasAvatar ? (
                <img src={avatarUrl} alt="" className="size-9 rounded-full object-cover shrink-0 mt-1" />
              ) : (
                <div className="size-9 rounded-full bg-white/90 text-rose-600 grid place-items-center text-xs font-bold shrink-0 mt-1 shadow">
                  {name.slice(0, 1).toUpperCase()}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <Nameplate
                    id={meta?.equipped_nameplate_id}
                    className="inline-flex items-center rounded-md px-3 py-1 min-w-0 h-7 max-h-7 pr-12 shadow-sm isolate"
                    fallbackStyle={{
                      background: "linear-gradient(135deg, #1a4a2a 0%, #2d6a3f 50%, #1a4a2a 100%)",
                    }}
                  >
                    <span
                      className={cn(
                        "relative z-10 font-semibold text-sm truncate px-2 -mx-2 rounded text-white",
                        roleFlashClass(role),
                      )}
                      style={{
                        background:
                          "linear-gradient(90deg, transparent 0%, rgba(0,0,0,0.35) 12%, rgba(0,0,0,0.35) 88%, transparent 100%)",
                      }}
                    >
                      {name}
                    </span>
                  </Nameplate>
                  {role && (
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-white/75 shrink-0">
                      {formatRoleLabel(role)}
                    </span>
                  )}
                  <span className="text-[10px] text-white/70 shrink-0">
                    {new Date(m.created_at).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short", timeZone: tz })}
                  </span>
                  {m.is_internal && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-300/20 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-100 shrink-0">
                      <Lock className="size-3" /> Internal
                    </span>
                  )}
                  {m.edited_at && (
                    <span className="text-[10px] italic text-white/60 shrink-0">edited</span>
                  )}
                  {canEditMessage(m) && ticket.status !== "closed" && editingId !== m.id && (
                    <button
                      type="button"
                      onClick={() => startEdit(m)}
                      title="Edit this reply"
                      className="shrink-0 inline-flex items-center gap-1 rounded-md bg-white/15 hover:bg-white/25 border border-white/25 px-1.5 py-0.5 text-[10px] font-semibold text-white"
                    >
                      <Pencil className="size-3" /> Edit
                    </button>
                  )}
                </div>
                <div
                  className={cn(
                    "rounded-2xl px-3 sm:px-4 py-2 text-sm shadow max-w-[90%] sm:max-w-[75%]",
                    m.is_internal
                      ? "bg-amber-200/90 text-amber-950 border border-amber-300"
                      : "bg-white/15 backdrop-blur text-white border border-white/25",
                  )}
                >
                  {editingId === m.id ? (
                    <div className="space-y-2">
                      <textarea
                        value={editDraft}
                        onChange={(e) => setEditDraft(e.target.value)}
                        rows={3}
                        maxLength={2000}
                        className="w-full rounded-lg bg-black/25 border border-white/30 px-2 py-1.5 text-sm text-white outline-none focus:border-white resize-y"
                      />
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => saveEdit(m)}
                          className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 text-xs font-semibold text-rose-600 hover:bg-white/90"
                        >
                          <Check className="size-3" /> Save
                        </button>
                        <button
                          type="button"
                          onClick={() => { setEditingId(null); setEditDraft(""); }}
                          className="inline-flex items-center gap-1 rounded-md border border-white/30 px-2 py-1 text-xs font-semibold text-white hover:bg-white/15"
                        >
                          <X className="size-3" /> Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <MentionText content={m.content} currentUsername={myUsername} />
                  )}
                  <TicketAttachments items={m.attachments} />
                </div>
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

      <div className="border-t border-white/20 p-2 sm:p-3 bg-white/5 backdrop-blur">
        {ticket.status === "closed" ? (
          <div className="text-center text-xs text-white/80 py-2">This ticket is closed.</div>
        ) : (
          <div className="space-y-2">
            <div className="relative flex gap-2">
              {mention.dropdown}
              {channelJump.dropdown}
              <textarea
                ref={taRef}
                value={draft} onChange={(e) => onDraftChange(e.target.value)} rows={1} maxLength={2000}
                onBlur={() => sendTyping(true)}
                placeholder={internal ? "Internal note (staff only)… type @ to mention, # for links" : "Reply to ticket… type @ to mention, # for links"}
                onPaste={(e) => {
                  const imgs = extractImagesFromClipboard(e);
                  if (imgs.length) {
                    e.preventDefault();
                    setReplyFiles([...replyFiles, ...imgs]);
                    toast.success(`Attached ${imgs.length} pasted image${imgs.length > 1 ? "s" : ""}`);
                  }
                }}
                onKeyDown={(e) => {
                  if (channelJump.onKeyDown(e)) return;
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
      </div>
      {linkedOrder && (
        <aside className="hidden lg:flex flex-col w-80 shrink-0 min-h-0 max-h-full border-l border-white/20 bg-white/5 backdrop-blur overflow-y-auto overscroll-contain p-4 pb-10">
          <div className="text-[10px] uppercase tracking-wider text-white/70 mb-2">Order</div>
          {orderPanelInner}
        </aside>
      )}
    </div>
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
        toast.error(error.message || "Couldn't notify owners");
      } else if (typeof data === "number" && data === 0) {
        toast.message("Owners were already notified recently. Please wait a few minutes.");
      } else {
        toast.success("Owner and management have been notified.");
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
      title="Request help from owner or management"
      className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-amber-300 text-amber-950 hover:bg-amber-200 disabled:opacity-60 text-xs font-semibold shadow"
    >
      <HelpCircle className="size-3.5" />
      {busy ? "Notifying…" : "Request owner help"}
    </button>
  );
}

function HandOverTicketButton({
  ticketId, staff, currentUserId,
}: { ticketId: string; staff: Profile[]; currentUserId: string }) {
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const handOver = useServerFn(handOverTicket);
  const options = staff.filter((s) => s.id !== currentUserId);

  const submit = async () => {
    if (!to) return toast.error("Pick a staff member");
    setBusy(true);
    try {
      const res = await handOver({ data: { ticketId, toUserId: to, note: note.trim() || undefined } });
      if (!res?.ok) return toast.error(res?.reason ? `Couldn't pass this ticket over: ${res.reason}` : "Couldn't pass this ticket over");
      toast.success(`Ticket passed to ${res.toName ?? "staff"}`);
      setOpen(false);
      setTo("");
      setNote("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Handover failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Pass this ticket to another staff member"
        className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-sky-300 text-sky-950 hover:bg-sky-200 text-xs font-semibold shadow"
      >
        <Forward className="size-3.5" /> Pass ticket over
      </button>
      {open && createPortal(
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center overflow-y-auto bg-black/75 p-4 backdrop-blur-sm"
          onClick={() => !busy && setOpen(false)}
        >
          <div
            className="my-auto w-full max-w-md overflow-hidden rounded-2xl border border-sky-300/30 bg-neutral-950/95 text-white shadow-[0_25px_60px_-15px_rgba(0,0,0,0.9)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 border-b border-white/10 bg-gradient-to-r from-sky-500/25 to-fuchsia-500/20 px-5 py-3">
              <Forward className="size-4 text-sky-200" />
              <div className="text-sm font-bold">Pass ticket to another staff member</div>
            </div>
            <div className="space-y-4 px-5 py-4">
              <div className="space-y-1.5">
                <label className="block text-[11px] font-semibold uppercase tracking-wide text-white/60">
                  Staff member
                </label>
                <select
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="w-full rounded-lg border border-white/20 bg-black/50 px-3 py-2 text-sm outline-none focus:border-sky-300/60"
                >
                  <option value="">Select staff…</option>
                  {options.map((s) => (
                    <option key={s.id} value={s.id}>{s.display_name || s.username || "Staff"}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="block text-[11px] font-semibold uppercase tracking-wide text-white/60">
                  Handover note <span className="font-normal normal-case tracking-normal text-white/40">(optional)</span>
                </label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  maxLength={500}
                  placeholder="Posted on the ticket as an internal note"
                  className="w-full resize-none rounded-lg border border-white/20 bg-black/50 px-3 py-2 text-sm outline-none focus:border-sky-300/60"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-white/10 bg-white/5 px-5 py-3">
              <button
                type="button" disabled={busy} onClick={() => setOpen(false)}
                className="rounded-md border border-white/25 px-3 py-1.5 text-xs font-semibold hover:bg-white/10"
              >Cancel</button>
              <button
                type="button" disabled={busy || !to} onClick={submit}
                className="rounded-md bg-sky-400 px-3 py-1.5 text-xs font-bold text-sky-950 hover:bg-sky-300 disabled:opacity-50"
              >{busy ? "Passing…" : "Pass over"}</button>
            </div>
          </div>
        </div>,
        document.body,
      )}


    </>
  );
}

const ROLE_BADGE: Record<string, string> = {
  admin: "bg-rose-500/30 text-rose-50 border-rose-300/40",
  management: "bg-amber-400/30 text-amber-50 border-amber-300/40",
  staff: "bg-sky-500/30 text-sky-50 border-sky-300/40",
  moderator: "bg-violet-500/30 text-violet-50 border-violet-300/40",
};

function StaffIdCard({ profile }: { profile: Profile }) {
  const roleFlashMap = useRoleFlashMap();
  const name = profile.display_name || profile.username || "Staff";
  const role = profile.role ?? "staff";
  return (
    <Nameplate
      id={profile.equipped_nameplate_id}
      className="inline-flex items-center gap-2 pl-1 pr-10 py-1.5 rounded-full shadow-md isolate min-h-9 shrink-0 overflow-visible"
      fallbackStyle={{ background: "rgba(255,255,255,0.10)", border: "1px solid rgba(255,255,255,0.20)", backdropFilter: "blur(4px)" }}
    >
      <span
        className={cn("relative z-10 inline-flex items-center gap-2", roleFlashClass(role))}
        title={`Assigned to ${name}`}
      >
        <img
          src={resolveAvatarUrl(profile.id, profile.avatar_url ?? null, roleFlashMap)}
          alt={name}
          className="size-7 rounded-full object-cover ring-1 ring-white/40"
        />
        <span className="flex flex-col leading-tight">
          <span className="text-xs font-semibold text-white drop-shadow whitespace-nowrap">{name}</span>
          <span className={cn("text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border self-start", ROLE_BADGE[role] ?? ROLE_BADGE.staff)}>
            {formatRoleLabel(role)}
          </span>
        </span>
      </span>
    </Nameplate>
  );
}
