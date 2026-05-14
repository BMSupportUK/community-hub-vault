import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Calendar, Plus, Trash2, Check, X, Clock, Users, Plane, Repeat, ShieldCheck, Loader2, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/_approved/shifts")({
  component: ShiftsPage,
});

type SlotType = "shift" | "hourly";
type ReqStatus = "pending" | "approved" | "denied";

interface Slot {
  id: string;
  shift_date: string;
  start_time: string;
  end_time: string;
  slot_type: SlotType;
  assigned_to: string | null;
  notes: string | null;
}
interface Holiday {
  id: string;
  user_id: string;
  start_date: string;
  end_date: string;
  reason: string | null;
  status: ReqStatus;
  created_at: string;
}
interface Swap {
  id: string;
  slot_id: string;
  requester_id: string;
  target_user_id: string | null;
  message: string | null;
  status: ReqStatus;
  created_at: string;
}
interface Profile { id: string; username: string | null; display_name: string | null; }

const DAY_TARGET = 3;

function startOfWeek(d: Date) {
  const x = new Date(d);
  const day = x.getDay(); // 0=Sun
  const diff = (day === 0 ? -6 : 1 - day);
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x;
}
function fmtDate(d: Date) { return d.toISOString().slice(0, 10); }
function dayLabel(d: Date) { return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }); }

function ShiftsPage() {
  const { user, hasAny, hasRole } = useAuth();
  const isAdmin = hasAny(["admin", "management"]);
  const isStaffOrAdmin = hasAny(["admin", "management", "staff"]);
  const isMod = hasRole("moderator");
  const canPick = isStaffOrAdmin || isMod;

  const [tab, setTab] = useState("welcome");
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date()));
  const [slots, setSlots] = useState<Slot[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [swaps, setSwaps] = useState<Swap[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [loading, setLoading] = useState(true);

  // Manage rota state
  const [newSlot, setNewSlot] = useState({ date: fmtDate(new Date()), start: "09:00", end: "17:00", type: "shift" as SlotType, notes: "" });

  // Holiday request state
  const [holForm, setHolForm] = useState({ start: "", end: "", reason: "" });

  // Swap dialog
  const [swapFor, setSwapFor] = useState<Slot | null>(null);
  const [swapMsg, setSwapMsg] = useState("");

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart); d.setDate(d.getDate() + i); return d;
  }), [weekStart]);

  const load = async () => {
    const weekEnd = new Date(weekStart); weekEnd.setDate(weekEnd.getDate() + 7);
    const [{ data: s }, { data: h }, { data: sw }] = await Promise.all([
      supabase.from("shift_slots").select("*").gte("shift_date", fmtDate(weekStart)).lt("shift_date", fmtDate(weekEnd)).order("shift_date").order("start_time"),
      supabase.from("holiday_requests").select("*").order("created_at", { ascending: false }),
      supabase.from("shift_swap_requests").select("*").order("created_at", { ascending: false }),
    ]);
    setSlots((s ?? []) as Slot[]);
    setHolidays((h ?? []) as Holiday[]);
    setSwaps((sw ?? []) as Swap[]);

    const ids = new Set<string>();
    (s ?? []).forEach((x: Slot) => x.assigned_to && ids.add(x.assigned_to));
    (h ?? []).forEach((x: Holiday) => ids.add(x.user_id));
    (sw ?? []).forEach((x: Swap) => { ids.add(x.requester_id); if (x.target_user_id) ids.add(x.target_user_id); });
    if (ids.size) {
      const { data: profs } = await supabase.from("profiles").select("id, username, display_name").in("id", Array.from(ids));
      setProfiles(Object.fromEntries((profs ?? []).map((p) => [p.id, p as Profile])));
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    const ch = supabase.channel("shifts")
      .on("postgres_changes", { event: "*", schema: "public", table: "shift_slots" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "holiday_requests" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "shift_swap_requests" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart.getTime()]);

  const slotsByDay = useMemo(() => {
    const m: Record<string, Slot[]> = {};
    for (const s of slots) (m[s.shift_date] ||= []).push(s);
    return m;
  }, [slots]);

  const filledShiftsForDay = (dateStr: string) =>
    (slotsByDay[dateStr] ?? []).filter((s) => s.slot_type === "shift" && s.assigned_to).length;

  const profName = (id: string | null) => {
    if (!id) return "";
    const p = profiles[id];
    return p?.display_name || p?.username || "User";
  };

  const claim = async (s: Slot) => {
    if (!user) return;
    if (s.slot_type === "hourly" && !isMod && !isAdmin) return toast.error("Hourly slots are for moderators");
    if (s.slot_type === "shift" && !isStaffOrAdmin) return toast.error("Full shifts are for staff");
    const { error } = await supabase.from("shift_slots").update({ assigned_to: user.id }).eq("id", s.id).is("assigned_to", null);
    if (error) return toast.error(error.message);
    toast.success("Shift claimed");
    load();
  };

  const release = async (s: Slot) => {
    if (!user) return;
    const { error } = await supabase.from("shift_slots").update({ assigned_to: null }).eq("id", s.id).eq("assigned_to", user.id);
    if (error) return toast.error(error.message);
    toast.success("Shift released");
    load();
  };

  const adminDeleteSlot = async (id: string) => {
    if (!confirm("Delete this slot?")) return;
    const { error } = await supabase.from("shift_slots").delete().eq("id", id);
    if (error) return toast.error(error.message);
    load();
  };

  const addSlot = async () => {
    if (!newSlot.date || !newSlot.start || !newSlot.end) return toast.error("Date, start and end required");
    const { error } = await supabase.from("shift_slots").insert({
      shift_date: newSlot.date,
      start_time: newSlot.start,
      end_time: newSlot.end,
      slot_type: newSlot.type,
      notes: newSlot.notes || null,
      created_by: user?.id ?? null,
    });
    if (error) return toast.error(error.message);
    toast.success("Slot added");
    setNewSlot({ ...newSlot, notes: "" });
    load();
  };

  const submitHoliday = async () => {
    if (!user) return;
    if (!holForm.start || !holForm.end) return toast.error("Start and end dates required");
    if (holForm.end < holForm.start) return toast.error("End must be after start");
    const { error } = await supabase.from("holiday_requests").insert({
      user_id: user.id, start_date: holForm.start, end_date: holForm.end, reason: holForm.reason || null,
    });
    if (error) return toast.error(error.message);
    toast.success("Holiday request submitted");
    setHolForm({ start: "", end: "", reason: "" });
    load();
  };

  const reviewHoliday = async (id: string, status: ReqStatus) => {
    const { error } = await supabase.from("holiday_requests").update({ status, reviewed_by: user?.id ?? null, reviewed_at: new Date().toISOString() }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(`Holiday ${status}`);
    load();
  };

  const submitSwap = async () => {
    if (!user || !swapFor) return;
    const { error } = await supabase.from("shift_swap_requests").insert({
      slot_id: swapFor.id, requester_id: user.id, message: swapMsg || null,
    });
    if (error) return toast.error(error.message);
    toast.success("Swap request submitted");
    setSwapFor(null); setSwapMsg("");
    load();
  };

  const reviewSwap = async (s: Swap, status: ReqStatus) => {
    if (status === "approved") {
      // For now, approval just unassigns the slot so anyone can re-claim; a target swap is logged in message.
      await supabase.from("shift_slots").update({ assigned_to: null }).eq("id", s.slot_id);
    }
    const { error } = await supabase.from("shift_swap_requests").update({ status, reviewed_by: user?.id ?? null, reviewed_at: new Date().toISOString() }).eq("id", s.id);
    if (error) return toast.error(error.message);
    toast.success(`Swap ${status}`);
    load();
  };

  const myShifts = slots.filter((s) => s.assigned_to === user?.id);
  const pendingHolidays = holidays.filter((h) => h.status === "pending");
  const pendingSwaps = swaps.filter((s) => s.status === "pending");

  if (loading) {
    return <main className="flex-1 grid place-items-center bg-gradient-to-br from-[#06122e] to-[#0b1e4a]"><Loader2 className="size-6 animate-spin text-sky-300" /></main>;
  }

  return (
    <div className="flex-1 overflow-y-auto bg-gradient-to-br from-[#06122e] via-[#0b1e4a] to-[#06122e]">
      <header className="px-8 pt-8 pb-6 border-b border-sky-500/30 bg-blue-950/40 backdrop-blur">
        <h1 className="font-display text-3xl font-bold bg-gradient-to-r from-cyan-300 via-sky-300 to-blue-300 bg-clip-text text-transparent">Shifts</h1>
        <p className="text-sky-200/80 mt-1">Pick your slots, request holiday, swap shifts.</p>
      </header>

      <div className="px-8 py-6">
        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <TabsList className="flex flex-wrap gap-1 bg-blue-950/60 border border-sky-500/30 h-auto p-1">
            {[
              { v: "welcome", label: "Welcome", Icon: Calendar },
              { v: "rota", label: "Rota", Icon: Users },
              { v: "mine", label: "My Shifts", Icon: Clock },
              { v: "holidays", label: "Holidays", Icon: Plane },
              ...(isAdmin ? [{ v: "requests", label: "Requests", Icon: ShieldCheck }, { v: "manage", label: "Manage Rota", Icon: Plus }] : []),
            ].map(({ v, label, Icon }) => (
              <TabsTrigger key={v} value={v} className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-600 data-[state=active]:via-sky-500 data-[state=active]:to-cyan-500 data-[state=active]:text-white text-sky-100/80">
                <Icon className="size-4 mr-1.5" /> {label}
              </TabsTrigger>
            ))}
          </TabsList>

          {/* WELCOME */}
          <TabsContent value="welcome" className="mt-6">
            <div className="rounded-2xl bg-gradient-to-br from-blue-600/30 via-sky-500/20 to-cyan-500/20 border border-sky-500/40 p-10 shadow-[0_0_60px_-15px_rgba(56,189,248,0.5)]">
              <h2 className="font-display text-3xl font-bold bg-gradient-to-r from-cyan-200 to-blue-200 bg-clip-text text-transparent">Welcome to Shifts</h2>
              <p className="mt-3 text-lg text-sky-100/90 max-w-2xl">
                Browse the upcoming rota, claim open shifts that fit your role, and manage time off — all in one place.
              </p>
              <ul className="mt-5 space-y-2 text-sky-100/80 max-w-2xl list-disc pl-5">
                <li><strong>Staff & Management:</strong> claim full shifts on the rota.</li>
                <li><strong>Moderators:</strong> pick hourly slots assigned by management.</li>
                <li>Each day needs <strong>{DAY_TARGET} staff filled</strong> — keep an eye on the day counters.</li>
                <li>Need time off? Submit a holiday request. Admin will review.</li>
                <li>Need to swap a shift? Open the slot and tap <em>Request swap</em>.</li>
              </ul>
              <Button className="mt-6 bg-gradient-to-r from-blue-600 via-sky-500 to-cyan-500 hover:opacity-90 text-white border-0 shadow-lg shadow-sky-900/50" onClick={() => setTab("rota")}>Open the rota</Button>
            </div>
          </TabsContent>

          {/* ROTA */}
          <TabsContent value="rota" className="mt-6">
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <Button variant="outline" className="bg-blue-950/40 border-sky-500/30 text-sky-100 hover:bg-blue-900/60" onClick={() => { const d = new Date(weekStart); d.setDate(d.getDate() - 7); setWeekStart(d); }}>← Prev week</Button>
              <div className="font-display text-lg text-sky-100">Week of {dayLabel(weekStart)}</div>
              <Button variant="outline" className="bg-blue-950/40 border-sky-500/30 text-sky-100 hover:bg-blue-900/60" onClick={() => { const d = new Date(weekStart); d.setDate(d.getDate() + 7); setWeekStart(d); }}>Next week →</Button>
              <Button variant="outline" className="bg-blue-950/40 border-sky-500/30 text-sky-100 hover:bg-blue-900/60 ml-auto" onClick={() => setWeekStart(startOfWeek(new Date()))}>Today</Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-7 gap-3">
              {days.map((d) => {
                const dateStr = fmtDate(d);
                const daySlots = slotsByDay[dateStr] ?? [];
                const filled = filledShiftsForDay(dateStr);
                const ok = filled >= DAY_TARGET;
                return (
                  <div key={dateStr} className="rounded-2xl bg-blue-950/50 border border-sky-500/30 p-3 backdrop-blur min-h-[180px] flex flex-col">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-sm font-semibold text-sky-100">{dayLabel(d)}</div>
                      <span className={cn("text-[11px] px-2 py-0.5 rounded-full font-semibold", ok ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40" : "bg-rose-500/20 text-rose-300 border border-rose-500/40")}>{filled}/{DAY_TARGET}</span>
                    </div>
                    <div className="space-y-2 flex-1">
                      {daySlots.length === 0 && <div className="text-xs text-sky-300/50 italic">No slots</div>}
                      {daySlots.map((s) => {
                        const mine = s.assigned_to === user?.id;
                        const taken = !!s.assigned_to;
                        return (
                          <div key={s.id} className={cn("rounded-lg p-2 border text-xs", taken ? (mine ? "bg-cyan-500/20 border-cyan-400/50" : "bg-blue-800/40 border-sky-500/30") : "bg-blue-900/40 border-dashed border-sky-400/30")}>
                            <div className="flex items-center justify-between gap-1">
                              <div className="font-mono text-sky-100">{s.start_time.slice(0,5)}–{s.end_time.slice(0,5)}</div>
                              <span className={cn("text-[10px] px-1.5 py-0.5 rounded uppercase font-semibold", s.slot_type === "hourly" ? "bg-violet-500/30 text-violet-200" : "bg-sky-500/30 text-sky-100")}>{s.slot_type === "hourly" ? "hourly" : "shift"}</span>
                            </div>
                            {s.notes && <div className="text-sky-200/60 mt-0.5">{s.notes}</div>}
                            <div className="mt-1.5 flex items-center justify-between gap-1">
                              <div className="text-sky-200/80 truncate">{taken ? profName(s.assigned_to) : "Open"}</div>
                              <div className="flex items-center gap-1">
                                {!taken && canPick && (
                                  ((s.slot_type === "hourly" && (isMod || isAdmin)) || (s.slot_type === "shift" && isStaffOrAdmin)) && (
                                    <button onClick={() => claim(s)} className="px-2 py-0.5 rounded bg-gradient-to-r from-blue-600 to-cyan-500 text-white font-semibold">Claim</button>
                                  )
                                )}
                                {mine && (
                                  <>
                                    <button onClick={() => { setSwapFor(s); setSwapMsg(""); }} className="px-2 py-0.5 rounded bg-violet-500/30 text-violet-100 hover:bg-violet-500/50">Swap</button>
                                    <button onClick={() => release(s)} className="px-2 py-0.5 rounded bg-rose-500/30 text-rose-100 hover:bg-rose-500/50">Release</button>
                                  </>
                                )}
                                {isAdmin && (
                                  <button onClick={() => adminDeleteSlot(s.id)} className="text-rose-300/70 hover:text-rose-300"><Trash2 className="size-3" /></button>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </TabsContent>

          {/* MY SHIFTS */}
          <TabsContent value="mine" className="mt-6">
            {myShifts.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-sky-500/40 p-12 text-center text-sky-200/70 bg-blue-950/30">You haven't claimed any shifts this week.</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {myShifts.map((s) => (
                  <div key={s.id} className="rounded-2xl bg-blue-950/50 border border-sky-500/30 p-4">
                    <div className="text-sky-100 font-semibold">{dayLabel(new Date(s.shift_date))}</div>
                    <div className="font-mono text-cyan-200 mt-1">{s.start_time.slice(0,5)} – {s.end_time.slice(0,5)}</div>
                    <div className="text-xs text-sky-200/70 mt-1 uppercase">{s.slot_type}</div>
                    {s.notes && <div className="text-sm text-sky-200/80 mt-2">{s.notes}</div>}
                    <div className="mt-3 flex gap-2">
                      <Button size="sm" variant="outline" className="bg-violet-500/20 border-violet-400/40 text-violet-100 hover:bg-violet-500/30" onClick={() => { setSwapFor(s); setSwapMsg(""); }}><Repeat className="size-3.5 mr-1" /> Request swap</Button>
                      <Button size="sm" variant="outline" className="bg-rose-500/20 border-rose-400/40 text-rose-100 hover:bg-rose-500/30" onClick={() => release(s)}>Release</Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* HOLIDAYS */}
          <TabsContent value="holidays" className="mt-6 space-y-6">
            <div className="rounded-2xl bg-blue-950/50 border border-sky-500/30 p-5">
              <h3 className="font-display text-lg font-semibold text-sky-100 mb-3">Request holiday</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <Label className="text-sky-200/80">Start</Label>
                  <Input type="date" value={holForm.start} onChange={(e) => setHolForm({ ...holForm, start: e.target.value })} className="bg-blue-950/60 border-sky-500/30 text-sky-50" />
                </div>
                <div>
                  <Label className="text-sky-200/80">End</Label>
                  <Input type="date" value={holForm.end} onChange={(e) => setHolForm({ ...holForm, end: e.target.value })} className="bg-blue-950/60 border-sky-500/30 text-sky-50" />
                </div>
                <div className="md:col-span-3">
                  <Label className="text-sky-200/80">Reason (optional)</Label>
                  <Textarea value={holForm.reason} onChange={(e) => setHolForm({ ...holForm, reason: e.target.value })} className="bg-blue-950/60 border-sky-500/30 text-sky-50" />
                </div>
              </div>
              <Button className="mt-4 bg-gradient-to-r from-blue-600 via-sky-500 to-cyan-500 text-white" onClick={submitHoliday}><Plane className="size-4 mr-1" /> Submit request</Button>
            </div>

            <div className="rounded-2xl bg-blue-950/50 border border-sky-500/30 overflow-hidden">
              <div className="px-5 py-3 border-b border-sky-500/30 text-sky-100 font-semibold">My holiday requests</div>
              {holidays.filter((h) => h.user_id === user?.id).length === 0 ? (
                <div className="px-5 py-6 text-sm text-sky-200/60">No requests yet.</div>
              ) : (
                <ul className="divide-y divide-sky-500/20">
                  {holidays.filter((h) => h.user_id === user?.id).map((h) => (
                    <li key={h.id} className="px-5 py-3 flex items-center gap-3">
                      <div className="flex-1">
                        <div className="text-sky-100">{h.start_date} → {h.end_date}</div>
                        {h.reason && <div className="text-xs text-sky-200/60">{h.reason}</div>}
                      </div>
                      <StatusPill status={h.status} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </TabsContent>

          {/* ADMIN REQUESTS */}
          {isAdmin && (
            <TabsContent value="requests" className="mt-6 space-y-6">
              <div className="rounded-2xl bg-blue-950/50 border border-sky-500/30 overflow-hidden">
                <div className="px-5 py-3 border-b border-sky-500/30 text-sky-100 font-semibold flex items-center gap-2"><Plane className="size-4" /> Holiday requests <span className="text-xs text-sky-300/70 ml-2">{pendingHolidays.length} pending</span></div>
                {holidays.length === 0 ? (
                  <div className="px-5 py-6 text-sm text-sky-200/60">No requests.</div>
                ) : (
                  <ul className="divide-y divide-sky-500/20">
                    {holidays.map((h) => (
                      <li key={h.id} className="px-5 py-3 flex items-center gap-3">
                        <div className="flex-1">
                          <div className="text-sky-100"><strong>{profName(h.user_id)}</strong> · {h.start_date} → {h.end_date}</div>
                          {h.reason && <div className="text-xs text-sky-200/60">{h.reason}</div>}
                        </div>
                        <StatusPill status={h.status} />
                        {h.status === "pending" && (
                          <div className="flex gap-1">
                            <Button size="sm" className="bg-emerald-500/30 text-emerald-100 hover:bg-emerald-500/50 border-0" onClick={() => reviewHoliday(h.id, "approved")}><Check className="size-3.5" /></Button>
                            <Button size="sm" className="bg-rose-500/30 text-rose-100 hover:bg-rose-500/50 border-0" onClick={() => reviewHoliday(h.id, "denied")}><X className="size-3.5" /></Button>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="rounded-2xl bg-blue-950/50 border border-sky-500/30 overflow-hidden">
                <div className="px-5 py-3 border-b border-sky-500/30 text-sky-100 font-semibold flex items-center gap-2"><Repeat className="size-4" /> Shift swap requests <span className="text-xs text-sky-300/70 ml-2">{pendingSwaps.length} pending</span></div>
                {swaps.length === 0 ? (
                  <div className="px-5 py-6 text-sm text-sky-200/60">No requests.</div>
                ) : (
                  <ul className="divide-y divide-sky-500/20">
                    {swaps.map((s) => {
                      const slot = slots.find((x) => x.id === s.slot_id);
                      return (
                        <li key={s.id} className="px-5 py-3 flex items-center gap-3">
                          <div className="flex-1">
                            <div className="text-sky-100"><strong>{profName(s.requester_id)}</strong> wants to swap {slot ? `${slot.shift_date} ${slot.start_time.slice(0,5)}–${slot.end_time.slice(0,5)}` : "a shift"}</div>
                            {s.message && <div className="text-xs text-sky-200/60">{s.message}</div>}
                          </div>
                          <StatusPill status={s.status} />
                          {s.status === "pending" && (
                            <div className="flex gap-1">
                              <Button size="sm" className="bg-emerald-500/30 text-emerald-100 hover:bg-emerald-500/50 border-0" onClick={() => reviewSwap(s, "approved")}><Check className="size-3.5" /></Button>
                              <Button size="sm" className="bg-rose-500/30 text-rose-100 hover:bg-rose-500/50 border-0" onClick={() => reviewSwap(s, "denied")}><X className="size-3.5" /></Button>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </TabsContent>
          )}

          {/* MANAGE ROTA */}
          {isAdmin && (
            <TabsContent value="manage" className="mt-6 space-y-6">
              <div className="rounded-2xl bg-blue-950/50 border border-sky-500/30 p-5">
                <h3 className="font-display text-lg font-semibold text-sky-100 mb-3">Add rota slot</h3>
                <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                  <div>
                    <Label className="text-sky-200/80">Date</Label>
                    <Input type="date" value={newSlot.date} onChange={(e) => setNewSlot({ ...newSlot, date: e.target.value })} className="bg-blue-950/60 border-sky-500/30 text-sky-50" />
                  </div>
                  <div>
                    <Label className="text-sky-200/80">Start</Label>
                    <Input type="time" value={newSlot.start} onChange={(e) => setNewSlot({ ...newSlot, start: e.target.value })} className="bg-blue-950/60 border-sky-500/30 text-sky-50" />
                  </div>
                  <div>
                    <Label className="text-sky-200/80">End</Label>
                    <Input type="time" value={newSlot.end} onChange={(e) => setNewSlot({ ...newSlot, end: e.target.value })} className="bg-blue-950/60 border-sky-500/30 text-sky-50" />
                  </div>
                  <div>
                    <Label className="text-sky-200/80">Type</Label>
                    <Select value={newSlot.type} onValueChange={(v) => setNewSlot({ ...newSlot, type: v as SlotType })}>
                      <SelectTrigger className="bg-blue-950/60 border-sky-500/30 text-sky-50"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="shift">Full shift (staff)</SelectItem>
                        <SelectItem value="hourly">Hourly (moderator)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="md:col-span-5">
                    <Label className="text-sky-200/80">Notes (optional)</Label>
                    <Input value={newSlot.notes} onChange={(e) => setNewSlot({ ...newSlot, notes: e.target.value })} className="bg-blue-950/60 border-sky-500/30 text-sky-50" />
                  </div>
                </div>
                <Button className="mt-4 bg-gradient-to-r from-blue-600 via-sky-500 to-cyan-500 text-white" onClick={addSlot}><Plus className="size-4 mr-1" /> Add slot</Button>
              </div>

              <div className="rounded-2xl bg-blue-950/50 border border-sky-500/30 overflow-hidden">
                <div className="px-5 py-3 border-b border-sky-500/30 text-sky-100 font-semibold">All slots this week</div>
                {slots.length === 0 ? (
                  <div className="px-5 py-6 text-sm text-sky-200/60">No slots configured for this week.</div>
                ) : (
                  <ul className="divide-y divide-sky-500/20">
                    {slots.map((s) => (
                      <li key={s.id} className="px-5 py-3 flex items-center gap-3 text-sm">
                        <div className="font-mono text-sky-200/80 w-28">{s.shift_date}</div>
                        <div className="font-mono text-cyan-200 w-28">{s.start_time.slice(0,5)}–{s.end_time.slice(0,5)}</div>
                        <div className="uppercase text-xs text-sky-300/80 w-20">{s.slot_type}</div>
                        <div className="flex-1 text-sky-100">{s.assigned_to ? profName(s.assigned_to) : <span className="text-sky-300/60">Open</span>}</div>
                        <Button size="sm" variant="ghost" className="text-rose-300 hover:text-rose-200 hover:bg-rose-500/10" onClick={() => adminDeleteSlot(s.id)}><Trash2 className="size-4" /></Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </TabsContent>
          )}
        </Tabs>
      </div>

      {/* SWAP DIALOG */}
      <Dialog open={!!swapFor} onOpenChange={(o) => { if (!o) setSwapFor(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Request shift swap</DialogTitle></DialogHeader>
          {swapFor && (
            <div className="space-y-3">
              <div className="text-sm text-muted-foreground">{swapFor.shift_date} · {swapFor.start_time.slice(0,5)}–{swapFor.end_time.slice(0,5)}</div>
              <div>
                <Label>Message to admin</Label>
                <Textarea value={swapMsg} onChange={(e) => setSwapMsg(e.target.value)} placeholder="Why do you need to swap?" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSwapFor(null)}>Cancel</Button>
            <Button onClick={submitSwap}>Submit</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatusPill({ status }: { status: ReqStatus }) {
  const map: Record<ReqStatus, string> = {
    pending: "bg-amber-500/20 text-amber-300 border-amber-500/40",
    approved: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
    denied: "bg-rose-500/20 text-rose-300 border-rose-500/40",
  };
  return <span className={cn("text-[11px] px-2 py-0.5 rounded-full border font-semibold uppercase", map[status])}>{status}</span>;
}