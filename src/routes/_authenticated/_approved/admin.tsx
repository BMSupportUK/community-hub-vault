import { createFileRoute, Link, Navigate, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ShieldCheck, Lock, KeyRound, Users, Ticket, ShoppingBag, ShieldAlert, KeySquare, Globe, Clock, FileText, Loader2, Shield, Star, Filter, Sparkles, LifeBuoy, RefreshCw, Copy, Download } from "lucide-react";
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

function generateBackupCode() {
  // 10-char alphanumeric, dash in middle: XXXXX-XXXXX (no ambiguous chars)
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  const chars = Array.from(bytes, (b) => alphabet[b % alphabet.length]);
  return `${chars.slice(0, 5).join("")}-${chars.slice(5).join("")}`;
}

function normalizeCode(input: string) {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
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
  const [mode, setMode] = useState<"unlock" | "reset" | "totp" | "backup">("unlock");
  const [totpCode, setTotpCode] = useState("");
  const [hasTotp, setHasTotp] = useState(false);
  const [backupCode, setBackupCode] = useState("");
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [failedCount, setFailedCount] = useState(0);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.rpc("check_admin_unlock_lockout");
      if (error) return;
      const d = data as any;
      setFailedCount(d?.failed_count ?? 0);
      setLockedUntil(d?.locked_until ? new Date(d.locked_until).getTime() : null);
    })();
  }, []);

  const isLocked = lockedUntil !== null && lockedUntil > now;
  const secondsRemaining = isLocked ? Math.ceil((lockedUntil! - now) / 1000) : 0;

  const recordFailure = async () => {
    const { data } = await supabase.rpc("record_admin_unlock_failure");
    const d = data as any;
    if (d) {
      setFailedCount(d.failed_count ?? 0);
      setLockedUntil(d.locked_until ? new Date(d.locked_until).getTime() : null);
    }
  };

  const clearFailures = async () => {
    await supabase.rpc("clear_admin_unlock_failures");
    setFailedCount(0);
    setLockedUntil(null);
  };

  const guardLocked = () => {
    if (isLocked) {
      toast.error(`Too many attempts. Try again in ${secondsRemaining}s.`);
      return true;
    }
    return false;
  };

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.mfa.listFactors();
      const verified = (data?.totp ?? []).some((f) => f.status === "verified");
      setHasTotp(verified);
    })();
  }, []);

  const unlockWithTotp = async () => {
    if (guardLocked()) return;
    if (!/^\d{6}$/.test(totpCode)) return toast.error("Enter the 6-digit code from your authenticator");
    setBusy(true);
    try {
      const { data: factors, error: lfErr } = await supabase.auth.mfa.listFactors();
      if (lfErr) throw lfErr;
      const factor = (factors?.totp ?? []).find((f) => f.status === "verified");
      if (!factor) throw new Error("No verified 2FA factor on your account");
      const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId: factor.id });
      if (chErr || !ch) throw chErr ?? new Error("Challenge failed");
      const { error: vErr } = await supabase.auth.mfa.verify({
        factorId: factor.id,
        challengeId: ch.id,
        code: totpCode,
      });
      if (vErr) throw new Error("Incorrect 2FA code");
      await clearFailures();
      toast.success("Admin unlocked");
      onUnlocked();
    } catch (e: any) {
      await recordFailure();
      toast.error(e.message ?? "Unlock failed");
    } finally { setBusy(false); }
  };

  const unlockWithBackup = async () => {
    if (guardLocked()) return;
    if (!user) return;
    const normalized = normalizeCode(backupCode);
    if (normalized.length < 8) return toast.error("Enter a valid backup code");
    setBusy(true);
    try {
      const hash = await sha256Hex(`${user.id}:${normalized}`);
      const { data: row, error } = await supabase
        .from("admin_backup_codes")
        .select("id, used_at")
        .eq("user_id", user.id)
        .eq("code_hash", hash)
        .maybeSingle();
      if (error) throw error;
      if (!row) throw new Error("Invalid backup code");
      if (row.used_at) throw new Error("This backup code has already been used");
      const { error: upErr } = await supabase
        .from("admin_backup_codes")
        .update({ used_at: new Date().toISOString() })
        .eq("id", row.id);
      if (upErr) throw upErr;
      await clearFailures();
      toast.success("Admin unlocked with backup code");
      onUnlocked();
    } catch (e: any) {
      await recordFailure();
      toast.error(e.message ?? "Unlock failed");
    } finally { setBusy(false); }
  };

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
    if (guardLocked()) return;
    if (!user?.email) return;
    if (!password || !pin) return toast.error("Enter password and PIN");
    setBusy(true);
    try {
      const { error: signErr } = await supabase.auth.signInWithPassword({ email: user.email, password });
      if (signErr) throw new Error("Incorrect password");
      const hash = await sha256Hex(`${user.id}:${pin}`);
      const { data: row } = await supabase.from("vault_pins").select("pin_hash").eq("user_id", user.id).maybeSingle();
      if (!row || row.pin_hash !== hash) throw new Error("Incorrect PIN");
      await clearFailures();
      toast.success("Admin unlocked");
      onUnlocked();
    } catch (e: any) {
      await recordFailure();
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
          {hasTotp && (
            <button
              type="button"
              onClick={() => { setMode("totp"); setPassword(""); setPin(""); }}
              className="w-full mt-3 text-xs text-primary hover:underline underline-offset-2"
            >
              Use a 2FA code instead
            </button>
          )}
          <button
            type="button"
            onClick={() => { setMode("backup"); setPassword(""); setPin(""); }}
            className="w-full mt-3 text-xs text-primary hover:underline underline-offset-2"
          >
            Use a backup recovery code
          </button>
          <button
            type="button"
            onClick={() => { setMode("reset"); setPin(""); setConfirmPin(""); }}
            className="w-full mt-3 text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
          >
            Forgot your PIN? Reset it
          </button>
        </>
      ) : mode === "totp" ? (
        <>
          <h2 className="font-display text-lg font-bold">Unlock with 2FA</h2>
          <p className="text-sm text-muted-foreground mb-4">Enter the 6-digit code from your authenticator app.</p>
          <input
            value={totpCode}
            onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123456"
            className="w-full mb-4 px-3 py-2.5 rounded-lg bg-surface-2 border border-border text-sm font-mono tracking-[0.4em] text-center"
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && unlockWithTotp()}
          />
          <button onClick={unlockWithTotp} disabled={busy} className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-60 flex items-center justify-center gap-2">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />} Verify & unlock
          </button>
          <button
            type="button"
            onClick={() => { setMode("unlock"); setTotpCode(""); }}
            className="w-full mt-3 text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
          >
            Back to password + PIN
          </button>
        </>
      ) : mode === "backup" ? (
        <>
          <h2 className="font-display text-lg font-bold">Unlock with backup code</h2>
          <p className="text-sm text-muted-foreground mb-4">Enter one of your one-time recovery codes. It will be marked used after unlocking.</p>
          <input
            value={backupCode}
            onChange={(e) => setBackupCode(e.target.value.toUpperCase())}
            placeholder="XXXXX-XXXXX"
            className="w-full mb-4 px-3 py-2.5 rounded-lg bg-surface-2 border border-border text-sm font-mono tracking-widest text-center uppercase"
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && unlockWithBackup()}
          />
          <button onClick={unlockWithBackup} disabled={busy} className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-60 flex items-center justify-center gap-2">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <LifeBuoy className="size-4" />} Verify & unlock
          </button>
          <button
            type="button"
            onClick={() => { setMode("unlock"); setBackupCode(""); }}
            className="w-full mt-3 text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
          >
            Back to password + PIN
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
    { to: "/admin-hero-boxes", label: "Landing hero boxes", desc: "Edit the three boxes shown on the public landing page.", icon: Sparkles },
  ];

  return (
    <div className="space-y-6">
      <RecoveryCodes />
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

interface BackupCodeRow {
  id: string;
  used_at: string | null;
  created_at: string;
  batch_id: string;
}

function RecoveryCodes() {
  const { user } = useAuth();
  const [rows, setRows] = useState<BackupCodeRow[] | null>(null);
  const [fresh, setFresh] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("admin_backup_codes")
      .select("id, used_at, created_at, batch_id")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });
    if (error) { toast.error(error.message); return; }
    setRows((data ?? []) as BackupCodeRow[]);
  };

  useEffect(() => { load(); }, [user?.id]);

  const generate = async () => {
    if (!user) return;
    if (!confirm("Generate a new batch of 10 codes? Any existing codes will be invalidated.")) return;
    setBusy(true);
    try {
      const batchId = crypto.randomUUID();
      const codes = Array.from({ length: 10 }, generateBackupCode);
      const hashes = await Promise.all(codes.map((c) => sha256Hex(`${user.id}:${normalizeCode(c)}`)));
      // Wipe old codes for this user
      const { error: delErr } = await supabase.from("admin_backup_codes").delete().eq("user_id", user.id);
      if (delErr) throw delErr;
      const rowsToInsert = hashes.map((h) => ({ user_id: user.id, code_hash: h, batch_id: batchId }));
      const { error: insErr } = await supabase.from("admin_backup_codes").insert(rowsToInsert);
      if (insErr) throw insErr;
      setFresh(codes);
      await load();
      toast.success("New backup codes generated. Save them now!");
    } catch (e: any) {
      toast.error(e.message ?? "Failed to generate codes");
    } finally { setBusy(false); }
  };

  const copyAll = async () => {
    if (!fresh) return;
    await navigator.clipboard.writeText(fresh.join("\n"));
    toast.success("Codes copied to clipboard");
  };

  const download = () => {
    if (!fresh) return;
    const blob = new Blob(
      [
        `Admin recovery codes\nGenerated: ${new Date().toISOString()}\nUser: ${user?.email ?? user?.id}\n\nEach code can be used once.\n\n${fresh.join("\n")}\n`,
      ],
      { type: "text/plain" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "admin-recovery-codes.txt"; a.click();
    URL.revokeObjectURL(url);
  };

  const total = rows?.length ?? 0;
  const remaining = rows?.filter((r) => !r.used_at).length ?? 0;
  const low = total > 0 && remaining <= 3;

  return (
    <section className="rounded-2xl border border-border bg-surface-1 p-5">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-primary/15 text-primary grid place-items-center">
            <LifeBuoy className="size-5" />
          </div>
          <div>
            <h2 className="font-display font-bold">Backup recovery codes</h2>
            <p className="text-xs text-muted-foreground">One-time codes to unlock the admin dashboard if you lose your password, PIN, or 2FA device.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs px-2 py-1 rounded-md border ${low ? "border-amber-500/40 text-amber-400 bg-amber-500/10" : "border-border text-muted-foreground bg-surface-2"}`}>
            {remaining} / {total} unused
          </span>
          <button
            onClick={generate}
            disabled={busy}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-60"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            {total === 0 ? "Generate codes" : "Regenerate batch"}
          </button>
        </div>
      </div>

      {low && (
        <div className="mb-3 text-xs px-3 py-2 rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-400">
          You're running low on backup codes. Regenerate a new batch and store them safely.
        </div>
      )}

      {fresh && (
        <div className="mb-4 rounded-xl border border-primary/40 bg-primary/5 p-4">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="text-sm font-medium">Save these codes now — they won't be shown again</div>
            <div className="flex gap-2">
              <button onClick={copyAll} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-surface-2 border border-border text-xs hover:bg-surface-3">
                <Copy className="size-3.5" /> Copy
              </button>
              <button onClick={download} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-surface-2 border border-border text-xs hover:bg-surface-3">
                <Download className="size-3.5" /> Download
              </button>
              <button onClick={() => setFresh(null)} className="px-2.5 py-1.5 rounded-md bg-surface-2 border border-border text-xs hover:bg-surface-3">
                Done
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 font-mono text-sm">
            {fresh.map((c) => (
              <div key={c} className="px-2 py-1.5 rounded-md bg-background border border-border text-center tracking-wider">{c}</div>
            ))}
          </div>
        </div>
      )}

      {rows && rows.length > 0 && (
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Current batch ({rows.length})</div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 font-mono text-sm">
            {rows.map((r, i) => (
              <div
                key={r.id}
                className={`px-2 py-1.5 rounded-md border text-center tracking-wider ${r.used_at ? "bg-surface-2 border-border text-muted-foreground line-through" : "bg-background border-border"}`}
                title={r.used_at ? `Used ${new Date(r.used_at).toLocaleString()}` : "Unused"}
              >
                Code #{String(i + 1).padStart(2, "0")}
              </div>
            ))}
          </div>
        </div>
      )}

      {rows && rows.length === 0 && !fresh && (
        <div className="text-sm text-muted-foreground">No backup codes yet. Generate a batch to keep handy in case you ever lose access.</div>
      )}
    </section>
  );
}