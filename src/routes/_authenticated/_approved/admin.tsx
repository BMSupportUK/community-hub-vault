import { createFileRoute, Link, Navigate, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ShieldCheck, Lock, KeyRound, Users, Ticket, ShoppingBag, ShieldAlert, KeySquare, Globe, Clock, FileText, Loader2, Shield, Star, Filter } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/_approved/admin")({
  validateSearch: (search: Record<string, unknown>) => ({
    next: typeof search.next === "string" ? (search.next as string) : undefined,
  }),
  component: AdminDashboard,
});

async function sha256Hex(input: string) {
  const enc = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const UNLOCK_TTL_MS = 60 * 60 * 1000;
const UNLOCK_KEY = (uid: string) => `admin_unlock_until:${uid}`;

interface Stats {
  users: number;
  pending: number;
  openTickets: number;
  pendingOrders: number;
  activeShifts: number;
  credentials: number;
  dnsCodes: number;
  blogs: number;
  pendingReviews: number;
}

function AdminDashboard() {
  const { user, hasAny } = useAuth();
  const isAdmin = hasAny(["admin", "management"]);
  const [hasPin, setHasPin] = useState<boolean | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [unlockedUntil, setUnlockedUntil] = useState(0);
  const { next } = Route.useSearch();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase.from("vault_pins").select("user_id").eq("user_id", user.id).maybeSingle();
      setHasPin(!!data);
      // Restore an unexpired unlock from this browser session
      try {
        const raw = sessionStorage.getItem(UNLOCK_KEY(user.id));
        const until = raw ? parseInt(raw, 10) : 0;
        if (until > Date.now()) {
          setUnlocked(true);
          setUnlockedUntil(until);
        } else if (raw) {
          sessionStorage.removeItem(UNLOCK_KEY(user.id));
        }
      } catch {}
    })();
  }, [user]);

  useEffect(() => {
    if (!unlocked) return;
    const t = setTimeout(() => setUnlocked(false), Math.max(0, unlockedUntil - Date.now()));
    return () => clearTimeout(t);
  }, [unlocked, unlockedUntil]);

  const lockNow = () => {
    setUnlocked(false);
    if (user) { try { sessionStorage.removeItem(UNLOCK_KEY(user.id)); } catch {} }
  };

  if (!isAdmin) return <Navigate to="/home" />;

  return (
    <main className="flex-1 overflow-y-auto">
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="relative rounded-3xl overflow-hidden border border-primary/30 shadow-glow bg-gradient-primary p-6 sm:p-8 mb-6">
          <div className="absolute inset-0 bg-gradient-to-tr from-background/40 via-transparent to-transparent pointer-events-none" />
          <header className="relative flex items-center gap-3">
            <div className="size-12 rounded-2xl bg-white/15 backdrop-blur grid place-items-center shadow-glow ring-1 ring-white/20">
              <ShieldCheck className="size-6 text-white" />
            </div>
            <div className="flex-1">
              <h1 className="font-display text-2xl sm:text-3xl font-bold text-white drop-shadow">Admin Dashboard</h1>
              <p className="text-sm text-white/85">Server-wide controls — restricted to admin &amp; management.</p>
            </div>
          {unlocked && (
            <button onClick={lockNow} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/15 backdrop-blur border border-white/25 text-sm text-white hover:bg-white/25">
              <Lock className="size-4" /> Lock
            </button>
          )}
          </header>
        </div>

        {hasPin === null ? (
          <div className="grid place-items-center py-16 text-muted-foreground"><Loader2 className="size-5 animate-spin" /></div>
        ) : !unlocked ? (
          <SecurityGate
            hasPin={hasPin}
            onUnlocked={() => {
              const until = Date.now() + UNLOCK_TTL_MS;
              setUnlocked(true);
              setUnlockedUntil(until);
              setHasPin(true);
              if (user) { try { sessionStorage.setItem(UNLOCK_KEY(user.id), String(until)); } catch {} }
              if (next && next.startsWith("/")) {
                navigate({ to: next });
              }
            }}
          />
        ) : (
          <DashboardBody />
        )}
      </div>
    </main>
  );
}

function SecurityGate({ hasPin, onUnlocked }: { hasPin: boolean; onUnlocked: () => void }) {
  const { user } = useAuth();
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"unlock" | "reset">("unlock");

  const setupPin = async () => {
    if (!user) return;
    if (pin.length < 4) return toast.error("PIN must be at least 4 characters");
    if (pin !== confirmPin) return toast.error("PINs do not match");
    setBusy(true);
    try {
      const hash = await sha256Hex(`${user.id}:${pin}`);
      const { error } = await supabase.from("vault_pins").upsert({ user_id: user.id, pin_hash: hash });
      if (error) throw error;
      toast.success("PIN set. Please unlock.");
      window.location.reload();
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    } finally { setBusy(false); }
  };

  const unlock = async () => {
    if (!user?.email) return;
    if (!password || !pin) return toast.error("Enter password and PIN");
    setBusy(true);
    try {
      const { error: signErr } = await supabase.auth.signInWithPassword({ email: user.email, password });
      if (signErr) throw new Error("Incorrect password");
      const hash = await sha256Hex(`${user.id}:${pin}`);
      const { data: row } = await supabase.from("vault_pins").select("pin_hash").eq("user_id", user.id).maybeSingle();
      if (!row || row.pin_hash !== hash) throw new Error("Incorrect PIN");
      toast.success("Admin unlocked");
      onUnlocked();
    } catch (e: any) {
      toast.error(e.message ?? "Unlock failed");
    } finally { setBusy(false); }
  };

  const resetPin = async () => {
    if (!user?.email) return;
    if (!password) return toast.error("Enter your account password");
    if (pin.length < 4) return toast.error("PIN must be at least 4 characters");
    if (pin !== confirmPin) return toast.error("PINs do not match");
    setBusy(true);
    try {
      const { error: signErr } = await supabase.auth.signInWithPassword({ email: user.email, password });
      if (signErr) throw new Error("Incorrect password");
      const hash = await sha256Hex(`${user.id}:${pin}`);
      const { error } = await supabase.from("vault_pins").upsert({ user_id: user.id, pin_hash: hash });
      if (error) throw error;
      toast.success("PIN reset. Please unlock with your new PIN.");
      setPassword(""); setPin(""); setConfirmPin("");
      setMode("unlock");
    } catch (e: any) {
      toast.error(e.message ?? "Reset failed");
    } finally { setBusy(false); }
  };

  return (
    <div className="max-w-md mx-auto rounded-2xl border border-border bg-surface-1 p-6">
      <div className="size-12 rounded-2xl bg-surface-2 grid place-items-center mb-4">
        <Lock className="size-5 text-primary" />
      </div>
      {!hasPin ? (
        <>
          <h2 className="font-display text-lg font-bold">Set your admin PIN</h2>
          <p className="text-sm text-muted-foreground mb-4">A personal PIN plus your account password is required to enter the admin dashboard.</p>
          <input value={pin} onChange={(e) => setPin(e.target.value)} type="password" placeholder="New PIN (min 4)" className="w-full mb-2 px-3 py-2.5 rounded-lg bg-surface-2 border border-border text-sm" />
          <input value={confirmPin} onChange={(e) => setConfirmPin(e.target.value)} type="password" placeholder="Confirm PIN" className="w-full mb-4 px-3 py-2.5 rounded-lg bg-surface-2 border border-border text-sm" />
          <button onClick={setupPin} disabled={busy} className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-60">
            {busy ? "Saving…" : "Save PIN"}
          </button>
        </>
      ) : mode === "unlock" ? (
        <>
          <h2 className="font-display text-lg font-bold">Admin security check</h2>
          <p className="text-sm text-muted-foreground mb-4">Enter your account password and admin PIN to continue.</p>
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="Account password" className="w-full mb-2 px-3 py-2.5 rounded-lg bg-surface-2 border border-border text-sm" autoFocus />
          <input value={pin} onChange={(e) => setPin(e.target.value)} type="password" placeholder="Admin PIN" className="w-full mb-4 px-3 py-2.5 rounded-lg bg-surface-2 border border-border text-sm" onKeyDown={(e) => e.key === "Enter" && unlock()} />
          <button onClick={unlock} disabled={busy} className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-60 flex items-center justify-center gap-2">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />} Unlock dashboard
          </button>
          <button
            type="button"
            onClick={() => { setMode("reset"); setPin(""); setConfirmPin(""); }}
            className="w-full mt-3 text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
          >
            Forgot your PIN? Reset it
          </button>
        </>
      ) : (
        <>
          <h2 className="font-display text-lg font-bold">Reset admin PIN</h2>
          <p className="text-sm text-muted-foreground mb-4">Confirm your account password, then choose a new PIN.</p>
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="Account password" className="w-full mb-2 px-3 py-2.5 rounded-lg bg-surface-2 border border-border text-sm" autoFocus />
          <input value={pin} onChange={(e) => setPin(e.target.value)} type="password" placeholder="New PIN (min 4)" className="w-full mb-2 px-3 py-2.5 rounded-lg bg-surface-2 border border-border text-sm" />
          <input value={confirmPin} onChange={(e) => setConfirmPin(e.target.value)} type="password" placeholder="Confirm new PIN" className="w-full mb-4 px-3 py-2.5 rounded-lg bg-surface-2 border border-border text-sm" onKeyDown={(e) => e.key === "Enter" && resetPin()} />
          <button onClick={resetPin} disabled={busy} className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-60 flex items-center justify-center gap-2">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />} Save new PIN
          </button>
          <button
            type="button"
            onClick={() => { setMode("unlock"); setPin(""); setConfirmPin(""); }}
            className="w-full mt-3 text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
          >
            Back to unlock
          </button>
        </>
      )}
    </div>
  );
}

function DashboardBody() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    (async () => {
      const cnt = (q: any) => q.then((r: any) => r.count ?? 0);
      const [users, pending, tickets, orders, shifts, creds, dns, blogs, reviews] = await Promise.all([
        cnt(supabase.from("profiles").select("id", { count: "exact", head: true })),
        cnt(supabase.from("user_roles").select("user_id", { count: "exact", head: true }).eq("role", "pending")),
        cnt(supabase.from("tickets").select("id", { count: "exact", head: true }).neq("status", "closed")),
        cnt(supabase.from("orders").select("id", { count: "exact", head: true }).eq("status", "pending")),
        cnt(supabase.from("shifts").select("id", { count: "exact", head: true }).is("clock_out", null)),
        cnt(supabase.from("app_credentials").select("id", { count: "exact", head: true })),
        cnt(supabase.from("qd_dns_codes").select("id", { count: "exact", head: true })),
        cnt(supabase.from("sports_blogs").select("id", { count: "exact", head: true })),
        cnt(supabase.from("customer_reviews").select("id", { count: "exact", head: true }).eq("status", "pending")),
      ]);
      setStats({ users, pending, openTickets: tickets, pendingOrders: orders, activeShifts: shifts, credentials: creds, dnsCodes: dns, blogs, pendingReviews: reviews });
    })();
  }, []);

  const tiles = [
    { label: "Total members", value: stats?.users, icon: Users, accent: "primary" },
    { label: "Pending approvals", value: stats?.pending, icon: ShieldAlert, accent: "amber" },
    { label: "Open tickets", value: stats?.openTickets, icon: Ticket, accent: "primary" },
    { label: "Pending orders", value: stats?.pendingOrders, icon: ShoppingBag, accent: "primary" },
    { label: "On shift now", value: stats?.activeShifts, icon: Clock, accent: "primary" },
    { label: "Credentials stored", value: stats?.credentials, icon: KeySquare, accent: "primary" },
    { label: "QD DNS codes", value: stats?.dnsCodes, icon: Globe, accent: "primary" },
    { label: "Sports blogs", value: stats?.blogs, icon: FileText, accent: "primary" },
    { label: "Reviews to approve", value: stats?.pendingReviews, icon: Star, accent: "amber" },
  ];

  const tools: { to: string; label: string; desc: string; icon: any }[] = [
    { to: "/admin-roles", label: "Members & roles", desc: "Assign roles to members and create or delete custom roles.", icon: ShieldCheck },
    { to: "/admin-permissions", label: "Role permissions", desc: "Choose which roles can access pages and what they can do in channels.", icon: Shield },
    { to: "/admin-credentials", label: "User credentials", desc: "Set up app logins assigned to each user.", icon: KeySquare },
    { to: "/admin-dns", label: "QD DNS codes", desc: "Add and edit shared DNS codes for all members.", icon: Globe },
    { to: "/moderation", label: "Moderation queue", desc: "Approve gate requests and manage members.", icon: ShieldAlert },
    { to: "/shifts", label: "Shifts overview", desc: "Review staff shifts and break history.", icon: Clock },
    { to: "/sports-guides", label: "Sports content", desc: "Publish blogs and manage categories.", icon: FileText },
    { to: "/admin-reviews", label: "Customer reviews", desc: "Approve, reject or delete customer feedback.", icon: Star },
    { to: "/admin-profanity", label: "Chat word filter", desc: "Manage the UK swear list and add custom blocked words.", icon: Filter },
  ];

  return (
    <div className="space-y-6">
      <section>
        <h2 className="font-display text-sm uppercase tracking-wide text-muted-foreground mb-3">Live snapshot</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {tiles.map((t) => (
            <div key={t.label} className="rounded-2xl border border-border bg-surface-1 p-4 hover:border-primary/50 hover:shadow-glow transition-all">
              <div className="flex items-center justify-between mb-3">
                <div className={`size-9 rounded-xl grid place-items-center ${t.accent === "amber" ? "bg-amber-500/15 text-amber-400" : "bg-primary/15 text-primary"}`}>
                  <t.icon className="size-4" />
                </div>
              </div>
              <div className="font-display text-2xl font-bold">{t.value ?? "—"}</div>
              <div className="text-xs text-muted-foreground mt-1">{t.label}</div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="font-display text-sm uppercase tracking-wide text-muted-foreground mb-3">Admin tools</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {tools.map((t) => (
            <Link
              key={t.to}
              to={t.to}
              className="group relative rounded-2xl border border-border bg-surface-1 p-4 hover:border-primary hover:shadow-glow transition-all overflow-hidden"
            >
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-accent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="flex items-center gap-3 mb-2">
                <div className="size-10 rounded-xl bg-gradient-primary grid place-items-center text-primary-foreground shadow-glow">
                  <t.icon className="size-5" />
                </div>
                <div className="font-display font-bold">{t.label}</div>
              </div>
              <p className="text-xs text-muted-foreground">{t.desc}</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}