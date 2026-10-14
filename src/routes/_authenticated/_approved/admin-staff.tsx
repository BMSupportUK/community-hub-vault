import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Pencil, Save, Search, Users } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useIsDemoAccount } from "@/hooks/use-demo-account";
import { supabase } from "@/integrations/supabase/client";
import { isAdminUnlocked } from "@/lib/admin-unlock";
import { STAFF_ROLES, STAFF_ROLE_LABELS, staffEmploymentGroup, validateStaffDates, type StaffRecord } from "@/lib/staff-employment";
import { Nameplate } from "@/components/app/Nameplate";
import { StaffEmploymentDates } from "@/components/app/StaffEmploymentDates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import office from "@/assets/staff-employment-office.jpg";

export const Route = createFileRoute("/_authenticated/_approved/admin-staff")({
  head: () => ({ meta: [
    { title: "Staff employment | BM Support Owner tools" },
    { name: "description", content: "Manage staff employment dates and preserved former staff records by role." },
    { property: "og:title", content: "Staff employment | BM Support Owner tools" },
    { property: "og:description", content: "Manage staff employment dates and preserved former staff records by role." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }), component: AdminStaff,
});
function AdminStaff() {
  const { hasAny, user } = useAuth();
  const demo = useIsDemoAccount();
  if (demo || !hasAny(["admin"])) return <Navigate to="/admin" />;
  if (!isAdminUnlocked(user?.id)) return <Navigate to="/admin" search={{ next: "/admin-staff" } as never} />;
  return <EmploymentDirectory />;
}
function EmploymentDirectory() {
  const { user } = useAuth();
  const [rows, setRows] = useState<StaffRecord[]>([]);
  const [group, setGroup] = useState("admin");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<StaffRecord | null>(null);
  const [joined, setJoined] = useState("");
  const [left, setLeft] = useState("");
  const [busy, setBusy] = useState(false);
  const load = async () => {
    setError("");
    const [records, profiles, roles] = await Promise.all([
      supabase.from("staff_records").select("*"),
      supabase.from("profiles").select("id,username,display_name,avatar_url,bio,equipped_nameplate_id"),
      supabase.from("user_roles").select("user_id,role"),
    ]);
    if (records.error || profiles.error || roles.error) { setError("Staff records could not be loaded."); setLoading(false); return; }
    const map = new Map<string, StaffRecord>((records.data ?? []).map((r) => [r.user_id, r]));
    for (const p of profiles.data ?? []) {
      const currentRoles = (roles.data ?? []).filter((r) => r.user_id === p.id).map((r) => String(r.role));
      const record = map.get(p.id);
      if (record?.leave_date) continue;
      if (!STAFF_ROLES.some((r) => currentRoles.includes(r))) { map.delete(p.id); continue; }
      map.set(p.id, { ...p, user_id: p.id, join_date: record?.join_date ?? null, leave_date: null, roles: currentRoles });
    }
    setRows([...map.values()].sort((a, b) => (a.username ?? a.display_name ?? "").localeCompare(b.username ?? b.display_name ?? "")));
    setLoading(false);
  };
  useEffect(() => { void load(); }, []);
  const filtered = rows.filter((r) => staffEmploymentGroup(r.roles, r) === group && `${r.username ?? ""} ${r.display_name ?? ""}`.toLowerCase().includes(query.toLowerCase()));
  const save = async () => {
    if (!editing) return;
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const invalid = validateStaffDates(joined, left, today);
    if (invalid) return toast.error(invalid);
    if (left && !editing.leave_date && !window.confirm("Mark this staff member as having left? Their staff access will be removed and their details kept in Staff who have left.")) return;
    setBusy(true);
    const { error } = await supabase.rpc("save_staff_record", { _user_id: editing.user_id, _join_date: joined, _leave_date: left || undefined });
    setBusy(false);
    if (error) return toast.error(error.message);
    setEditing(null);
    if (left) setGroup("former");
    await load();
    toast.success("Staff record saved");
  };
  return <main className="relative isolate min-h-[calc(100dvh-8rem)] min-w-0 flex-1">
    <img src={office} width={1536} height={1024} alt="" className="pointer-events-none absolute inset-0 -z-20 h-full w-full object-cover object-center" />
    <div className="pointer-events-none absolute inset-0 -z-10 bg-background/80" />
    <div className="w-full space-y-6 px-4 py-6 sm:px-8 sm:py-8">
      <Link to="/admin" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Owner tools</Link>
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="flex items-center gap-3 font-display text-3xl font-bold"><Users className="size-7 text-primary" /> Staff</h1>
        <div className="relative w-full sm:w-72"><Search className="absolute left-3 top-3 size-4 text-muted-foreground" /><Input aria-label="Search staff" placeholder="Search staff…" value={query} onChange={(e) => setQuery(e.target.value)} className="bg-background/80 pl-9" /></div>
      </header>
      <Tabs value={group} onValueChange={setGroup}>
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 bg-background/80 p-1">
          {[...STAFF_ROLES, "former"].map((role) => <TabsTrigger key={role} value={role} className="whitespace-normal">{STAFF_ROLE_LABELS[role] ?? "Staff who have left"} <span className="ml-2 text-xs">({rows.filter((r) => staffEmploymentGroup(r.roles, r) === role).length})</span></TabsTrigger>)}
        </TabsList>
      </Tabs>
      {loading ? <p role="status">Loading staff…</p> : error ? <div role="alert"><p>{error}</p><Button variant="outline" onClick={() => void load()}>Try again</Button></div> : filtered.length === 0 ? <p className="py-12 text-center text-muted-foreground">No staff found.</p> :
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((r) => <article key={r.user_id} className="min-w-0 space-y-4 rounded-lg border border-border bg-card/85 p-4 backdrop-blur">
            <div className="flex min-w-0 items-center gap-3">
              {r.avatar_url && <img src={r.avatar_url} alt="" width={48} height={48} className="size-12 shrink-0 rounded-full object-cover" />}
              <Nameplate id={r.equipped_nameplate_id} className="min-w-0 flex-1 rounded-md bg-gradient-primary px-3 py-3"><span className="relative z-10 block break-words pr-8 text-sm font-semibold">{r.username ?? r.display_name ?? "Staff"}</span></Nameplate>
            </div>
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">{r.roles.filter((role) => STAFF_ROLES.some((v) => v === role)).map((role) => <span key={role}>{STAFF_ROLE_LABELS[role]}</span>)}</div>
            {r.display_name && r.display_name !== r.username && <p className="text-sm">{r.display_name}</p>}
            {r.bio && <p className="break-words text-xs text-muted-foreground">{r.bio}</p>}
            <StaffEmploymentDates joined={r.join_date} left={r.leave_date} />
            <Button variant="outline" size="sm" onClick={() => { setEditing(r); setJoined(r.join_date ?? ""); setLeft(r.leave_date ?? ""); }}><Pencil className="mr-2 size-3.5" /> Edit dates</Button>
          </article>)}
        </div>}
    </div>
    <Dialog open={!!editing} onOpenChange={(open) => { if (!open && !busy) setEditing(null); }}>
      <DialogContent><DialogHeader><DialogTitle>Staff employment dates</DialogTitle></DialogHeader>
        {editing && <Nameplate id={editing.equipped_nameplate_id} className="rounded-md bg-gradient-primary px-4 py-3"><span className="relative z-10 pr-8">{editing.username ?? editing.display_name}</span></Nameplate>}
        <div className="space-y-2"><Label htmlFor="staff-joined">Date joined</Label><Input id="staff-joined" type="date" value={joined} onChange={(e) => setJoined(e.target.value)} /></div>
        <div className="space-y-2"><Label htmlFor="staff-left">Date left</Label><Input id="staff-left" type="date" value={left} onChange={(e) => setLeft(e.target.value)} disabled={editing?.user_id === user?.id} /></div>
        <Button onClick={() => void save()} disabled={busy}><Save className="mr-2 size-4" />{busy ? "Saving…" : "Save dates"}</Button>
      </DialogContent>
    </Dialog>
  </main>;
}