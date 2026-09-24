import { createFileRoute, Link, Navigate, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { BarChart3, ShieldCheck, Lock, KeyRound, ShieldAlert, KeySquare, Globe, Clock, FileText, Loader2, Shield, Star, Filter, Sparkles, LifeBuoy, RefreshCw, Copy, Download, Ban, Tag, Package, Bell, Trophy, MessageSquare, Image as ImageIcon, MonitorPlay, Eye, EyeOff, Landmark, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { backfillVpnDetection } from "@/lib/vpn-backfill.functions";
import { unlockWithStaffPin, requestStaffPinReset } from "@/lib/staff-pin.functions";
import { StaffPinAdminCard } from "@/components/app/StaffPinAdminCard";
import { setAppTheme, useDefaultAppTheme } from "@/hooks/use-app-theme";
import { ThemePicker, APP_THEME_OPTIONS } from "@/components/app/ThemePicker";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/_approved/admin")({
  validateSearch: (search: Record<string, unknown>): { next?: string } => ({
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
    <main className="h-full min-h-0 flex-1 overflow-y-auto overscroll-contain">
      <div className="w-full px-4 sm:px-6 py-8">
        <div className="relative rounded-3xl overflow-hidden border border-primary/30 shadow-glow bg-gradient-primary p-6 sm:p-8 mb-6">
          <div className="absolute inset-0 bg-gradient-to-tr from-background/40 via-transparent to-transparent pointer-events-none" />
          <header className="relative flex items-center gap-3">
            <div className="size-12 rounded-2xl bg-white/15 backdrop-blur grid place-items-center shadow-glow ring-1 ring-white/20">
              <ShieldCheck className="size-6 text-white" />
            </div>
            <div className="flex-1">
              <h1 className="font-display text-2xl sm:text-3xl font-bold text-white drop-shadow">BM Support | Admin Dashboard</h1>
              <p className="text-sm text-white/85">Server-wide controls — staff can see the sections admin allows them to.</p>
            </div>
          <div className="flex items-center gap-2">
            <Link
              to="/admin-sounds"
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/15 backdrop-blur border border-white/25 text-sm text-white hover:bg-white/25"
            >
              <Bell className="size-4" /> Notification sounds
            </Link>
            {unlocked && (
              <button onClick={lockNow} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/15 backdrop-blur border border-white/25 text-sm text-white hover:bg-white/25">
                <Lock className="size-4" /> Lock
              </button>
            )}
          </div>
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
                const [to, query = ""] = next.split("?");
                const search = Object.fromEntries(new URLSearchParams(query));
                navigate({ to: to as never, search: search as never });
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
  const unlockFn = useServerFn(unlockWithStaffPin);
  const requestResetFn = useServerFn(requestStaffPinReset);
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
      toast.success("Owner unlocked");
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
      toast.success("Owner unlocked with backup code");
      onUnlocked();
    } catch (e: any) {
      await recordFailure();
      toast.error(e.message ?? "Unlock failed");
    } finally { setBusy(false); }
  };

  const unlock = async () => {
    if (guardLocked()) return;
    if (!password || !pin) return toast.error("Enter password and PIN");
    setBusy(true);
    try {
      const res = await unlockFn({ data: { password, pin } });
      if (!res.ok) throw new Error(res.error ?? "Unlock failed");
      await clearFailures();
      toast.success("Dashboard unlocked");
      onUnlocked();
    } catch (e: any) {
      await recordFailure();
      toast.error(e.message ?? "Unlock failed");
    } finally { setBusy(false); }
  };

  const resetPin = async () => {
    setBusy(true);
    try {
      const res = await requestResetFn({ data: { reason: password.trim() || undefined } });
      toast.success(res.already ? "You already have a pending request — an admin will issue your PIN soon." : "Request sent. An admin will issue your new PIN.");
      setPassword("");
      setMode("unlock");
    } catch (e: any) {
      toast.error(e.message ?? "Request failed");
    } finally { setBusy(false); }
  };

  return (
    <div className="max-w-md mx-auto rounded-2xl border border-border bg-surface-1 p-6">
      <div className="size-12 rounded-2xl bg-surface-2 grid place-items-center mb-4">
        <Lock className="size-5 text-primary" />
      </div>
      {isLocked && (
        <div className="mb-4 px-3 py-2 rounded-lg border border-destructive/40 bg-destructive/10 text-destructive text-sm">
          Too many failed attempts. Try again in {secondsRemaining}s.
        </div>
      )}
      {!isLocked && failedCount > 0 && hasPin && (
        <div className="mb-4 px-3 py-2 rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-400 text-xs">
          {5 - failedCount} attempt{5 - failedCount === 1 ? "" : "s"} remaining before lockout.
        </div>
      )}
      {!hasPin && mode !== "reset" && mode !== "totp" && mode !== "backup" ? (
        <>
          <h2 className="font-display text-lg font-bold">No staff PIN yet</h2>
          <p className="text-sm text-muted-foreground mb-4">Staff PINs are issued by an admin. Request one and you'll get a mention when it's ready.</p>
          <button onClick={() => setMode("reset")} className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium">
            Request a staff PIN
          </button>
          {hasTotp && (
            <button type="button" onClick={() => setMode("totp")} className="w-full mt-3 text-xs text-primary hover:underline underline-offset-2">
              Use a 2FA code instead
            </button>
          )}
          <button type="button" onClick={() => setMode("backup")} className="w-full mt-3 text-xs text-primary hover:underline underline-offset-2">
            Use a backup recovery code
          </button>
        </>
      ) : mode === "unlock" ? (
        <>
          <h2 className="font-display text-lg font-bold">Enter your staff PIN</h2>
          <p className="text-sm text-muted-foreground mb-4">Enter your account password and staff PIN to continue.</p>
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="Account password" className="w-full mb-2 px-3 py-2.5 rounded-lg bg-surface-2 border border-border text-sm" autoFocus />
          <input value={pin} onChange={(e) => setPin(e.target.value)} type="password" placeholder="Staff PIN" className="w-full mb-4 px-3 py-2.5 rounded-lg bg-surface-2 border border-border text-sm" onKeyDown={(e) => e.key === "Enter" && unlock()} />
          <button onClick={unlock} disabled={busy || isLocked} className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-60 flex items-center justify-center gap-2">
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
          <button onClick={unlockWithTotp} disabled={busy || isLocked} className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-60 flex items-center justify-center gap-2">
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
          <button onClick={unlockWithBackup} disabled={busy || isLocked} className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-60 flex items-center justify-center gap-2">
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
          <h2 className="font-display text-lg font-bold">Request a new staff PIN</h2>
          <p className="text-sm text-muted-foreground mb-4">An admin will be alerted and will issue you a new PIN. You'll get a mention once it's ready — view it on your profile's Staff PIN tab.</p>
          <textarea value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Reason (optional)" rows={2} className="w-full mb-4 px-3 py-2.5 rounded-lg bg-surface-2 border border-border text-sm" />
          <button onClick={resetPin} disabled={busy} className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-60 flex items-center justify-center gap-2">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />} Send reset request
          </button>
          <button
            type="button"
            onClick={() => { setMode("unlock"); setPassword(""); }}
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
  const { hasRole } = useAuth();
  const isAdminOnly = hasRole("admin");
  const canSeePins = isAdminOnly || hasRole("management");
  const [tab, setTab] = useState<"tools" | "staff-pins">("tools");





  const allTools: { to: string; search?: Record<string, string>; label: string; desc: string; icon: any; adminOnly?: boolean }[] = [
    { to: "/admin-roles", label: "Members & Role Management", desc: "Assign roles to members and create or delete custom roles.", icon: ShieldCheck },
    { to: "/admin-permissions", label: "Role permissions", desc: "Choose which roles can access pages and what they can do in channels.", icon: Shield },
    { to: "/admin-credentials", label: "User credentials", desc: "Set up app logins assigned to each user.", icon: KeySquare },
    { to: "/admin-dns", label: "QD DNS codes", desc: "Add and edit shared DNS codes for all members.", icon: Globe },
    { to: "/moderation", label: "BM Support | Access Requests", desc: "Approve access requests and appeals.", icon: ShieldAlert },
    { to: "/shifts", label: "Shifts overview", desc: "Review staff shifts and break history.", icon: Clock },
    { to: "/sports-guides", label: "Sports content", desc: "Publish blogs and manage categories.", icon: FileText },
    { to: "/admin-sports-import", label: "Sports import", desc: "Paste Discord listings — AI splits them into events and routes them to the right category.", icon: Sparkles },
    { to: "/admin-reviews", label: "Customer reviews", desc: "Approve, reject or delete customer feedback.", icon: Star },
    { to: "/admin-profanity", label: "Chat word filter", desc: "Manage the UK swear list and add custom blocked words.", icon: Filter },
    { to: "/admin-hero-boxes", label: "Landing hero boxes", desc: "Edit the three boxes shown on the public landing page.", icon: Sparkles },
    { to: "/admin-packages", label: "Support packages", desc: "Edit the price boxes shown on the public packages page.", icon: Sparkles },
    { to: "/admin-blacklist", label: "Blacklist", desc: "Ban accounts by email address or IP — applied immediately and at signup.", icon: Ban },
    { to: "/admin-business-hours", label: "Business hours", desc: "Set opening hours per day. Auto-replies when orders or tickets open out of hours.", icon: Clock },
    { to: "/admin-nameplates", label: "Nameplates", desc: "Manage the catalog of decorative nameplates and assign them to members.", icon: Sparkles },
    { to: "/admin-notifications", label: "Telegram alerts", desc: "Send a Telegram message when a new signup, ticket or sale comes in.", icon: Bell },
    { to: "/admin-automated-messages", label: "Automated messages & emails", desc: "Edit the wording of every message and email the system sends on its own.", icon: MessageSquare, adminOnly: true },
    { to: "/admin-ticket-categories", label: "Ticket categories", desc: "Edit the names and descriptions of support ticket categories.", icon: LifeBuoy },
    { to: "/admin-archived-tickets", label: "Archived tickets", desc: "Browse and restore tickets auto-archived 7 days after closing.", icon: LifeBuoy },
    { to: "/admin-fan-zone", label: "Boro Fan Zone", desc: "Approve, reject or revoke fan-zone access for Middlesbrough F.C. supporters.", icon: Trophy },
    { to: "/admin-boro-team-sheet", label: "Boro team sheets", desc: "Watch the official Middlesbrough line-up post and add it to the match day thread automatically.", icon: Trophy },
    { to: "/admin-predictions", label: "World Cup predictions", desc: "Manage fixtures, scores, leaderboard and prize settings for the 2026 predictions game.", icon: Trophy },
    { to: "/admin-fantasy-motm", label: "Fantasy Man of the Match", desc: "Award the 3-point Man of the Match bonus for each MFC Fantasy Manager gameweek.", icon: Trophy },
    { to: "/admin-fantasy-scoring", label: "Fantasy points scoring", desc: "Change or remove the points awarded for every match stat in the MFC Fantasy Manager.", icon: Trophy, adminOnly: true },
    { to: "/admin-fantasy-injuries", label: "Fantasy injuries", desc: "Flag injured, doubtful or suspended players in the MFC Fantasy Manager squad lists.", icon: Trophy },
    { to: "/admin-fantasy-squad-numbers", label: "Fantasy squad numbers & extra positions", desc: "Set or change each player's squad number, and give a player an extra position they can be picked in.", icon: Trophy },
    { to: "/admin-forum", label: "Forum boards", desc: "Create boards, pin/lock them, and assign board-specific moderators.", icon: MessageSquare },
    { to: "/admin-affiliate-banners", label: "Affiliate banners", desc: "Upload sidebar advert images and assign them to forum boards.", icon: ImageIcon },
    { to: "/admin-streaming-devices", label: "Streaming devices", desc: "Manage the streaming device catalogue and refresh UK retailer prices.", icon: MonitorPlay },
    { to: "/shop", search: { view: "admin" }, label: "Shop products", desc: "Add, edit and reorder shop products and categories.", icon: Package, adminOnly: true },
    { to: "/shop", search: { view: "discounts" }, label: "Discount codes", desc: "Create and manage promotional discount codes.", icon: Tag, adminOnly: true },
    { to: "/admin-bank-transfer", label: "Bank transfer", desc: "Set the bank details customers see and grant bank-transfer payment access.", icon: Landmark, adminOnly: true },
    { to: "/install-guides", search: { tab: "app-apk" }, label: "App APK & transfers", desc: "Upload the Android APK and monitor the live 24-hour install links members have requested.", icon: Package },
    { to: "/admin-sounds", label: "Notification sounds", desc: "Play and verify every notification MP3 used across the app, and set volume for this device.", icon: Bell },
    { to: "/admin-ad-stats", label: "Advert performance", desc: "See how many views and clicks each advert unit gets on bmsupport.uk, by page and by day.", icon: BarChart3 },
    { to: "/admin-shifts", label: "Staff shifts", desc: "Review every staff shift, clock-in, clock-out, breaks and auto clock-out, grouped by day.", icon: Users },
  ];
  const tools = allTools
    .filter((t) => !t.adminOnly || isAdminOnly)
    .sort((a, b) => a.label.localeCompare(b.label, "en-GB", { sensitivity: "base" }));

  return (
    <div className="space-y-6">
      {isAdminOnly || hasRole("management") ? <StaffPinAdminCard /> : null}

    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px] items-start">
      <section className="min-w-0">
        <h2 className="font-display text-sm uppercase tracking-wide text-muted-foreground mb-3">Owner tools</h2>
        <div className="grid sm:grid-cols-2 2xl:grid-cols-3 gap-3">
          {tools.map((t) => (
            <Link
              key={`${t.to}-${t.label}`}
              to={t.to}
              search={t.search as any}
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

      <aside className="min-w-0 space-y-4 xl:sticky xl:top-4 xl:self-start">
        <ThemePickerCard />
        <RecoveryCodes />
        <VpnBackfillCard />
      </aside>
    </div>
    </div>
  );
}



interface BackupCodeRow {
  id: string;
  used_at: string | null;
  created_at: string;
  batch_id: string;
  code: string | null;
}

function VpnBackfillCard() {
  const { hasAny } = useAuth();
  const isAdmin = hasAny(["admin", "management"]);
  const runBackfill = useServerFn(backfillVpnDetection);
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<{ scanned: number; uniqueIps: number; updated: number; flagged: number } | null>(null);

  if (!isAdmin) return null;

  const run = async () => {
    if (!confirm("Run VPN/proxy detection across all known user IPs? This calls proxycheck.io.")) return;
    setBusy(true);
    try {
      const res = await runBackfill();
      setLast(res);
      toast.success(`Done — flagged ${res.flagged} of ${res.updated} users (from ${res.uniqueIps} unique IPs).`);
    } catch (e: any) {
      toast.error(e?.message ?? "Backfill failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-2xl border border-border bg-surface-1 p-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-amber-500/15 text-amber-400 grid place-items-center">
            <ShieldAlert className="size-5" />
          </div>
          <div>
            <h2 className="font-display font-bold">VPN / proxy backfill</h2>
            <p className="text-xs text-muted-foreground max-w-xl">
              Detect VPN or proxy use across all existing members using their most recent known IP.
              Flagged users will show an amber shield next to their name everywhere on the site.
            </p>
            {last && (
              <p className="text-[11px] text-muted-foreground mt-1">
                Last run: scanned {last.scanned} users, {last.uniqueIps} unique IPs, updated {last.updated}, flagged {last.flagged}.
              </p>
            )}
          </div>
        </div>
        <button
          onClick={run}
          disabled={busy}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-60"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          {busy ? "Scanning…" : "Run VPN scan"}
        </button>
      </div>
    </section>
  );
}

function RecoveryCodes() {
  const { user } = useAuth();
  const [rows, setRows] = useState<BackupCodeRow[] | null>(null);
  const [fresh, setFresh] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);
  const [revealed, setRevealed] = useState(false);

  const load = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("admin_backup_codes")
      .select("id, used_at, created_at, batch_id, code")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });
    if (error) { toast.error(error.message); return; }
    setRows((data ?? []) as BackupCodeRow[]);
  };

  useEffect(() => { load(); }, [user?.id]);

  const generate = async () => {
    if (!user) return;
    setBusy(true);
    try {
      const batchId = crypto.randomUUID();
      const codes = Array.from({ length: 10 }, generateBackupCode);
      const hashes = await Promise.all(codes.map((c) => sha256Hex(`${user.id}:${normalizeCode(c)}`)));
      // Wipe old codes for this user
      const { error: delErr } = await supabase.from("admin_backup_codes").delete().eq("user_id", user.id);
      if (delErr) throw delErr;
      const rowsToInsert = hashes.map((h, i) => ({ user_id: user.id, code_hash: h, batch_id: batchId, code: codes[i] }));
      const { error: insErr } = await supabase.from("admin_backup_codes").insert(rowsToInsert);
      if (insErr) throw insErr;
      setFresh(codes);
      setConfirmRegenerate(false);
      await load();
      toast.success("New backup codes generated. Save them now!");
    } catch (e: any) {
      toast.error(e.message ?? "Failed to generate codes");
    } finally { setBusy(false); }
  };

  const writeClipboard = async (text: string) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {
      /* fall through to legacy path */
    }
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.top = "0";
      ta.style.left = "0";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      ta.setSelectionRange(0, text.length);
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  };

  const copyAll = async () => {
    const list = fresh ?? rows?.filter((r) => !r.used_at && r.code).map((r) => r.code!);
    if (!list || list.length === 0) {
      toast.error("No codes available to copy — generate a new batch");
      return;
    }
    const ok = await writeClipboard(list.join("\n"));
    if (ok) toast.success(`Copied ${list.length} codes to clipboard`);
    else toast.error("Clipboard blocked — select the codes manually to copy");
  };

  const copySingle = async (code: string) => {
    const ok = await writeClipboard(code);
    if (ok) toast.success(`Copied ${code}`);
    else toast.error("Clipboard blocked — select the code manually to copy");
  };


  const download = () => {
    if (!fresh) return;
    const blob = new Blob(
      [
        `Owner recovery codes\nGenerated: ${new Date().toISOString()}\nUser: ${user?.email ?? user?.id}\n\nEach code can be used once.\n\n${fresh.join("\n")}\n`,
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
            <p className="text-xs text-muted-foreground">One-time codes to unlock the owner dashboard if you lose your password, PIN, or 2FA device.</p>
          </div>
        </div>
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:justify-end">
          <span className={`col-span-2 flex min-h-10 items-center justify-center rounded-md border px-2 py-1 text-center text-xs sm:col-span-1 sm:min-h-0 ${low ? "border-amber-500/40 text-amber-400 bg-amber-500/10" : "border-border text-muted-foreground bg-surface-2"}`}>
            {remaining} / {total} unused
          </span>
          {rows && rows.length > 0 && (
            <button
              onClick={() => setRevealed((v) => !v)}
              className="flex min-w-0 items-center justify-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm font-medium hover:bg-surface-3"
              aria-label={revealed ? "Hide backup codes" : "Reveal backup codes"}
            >
              {revealed ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              {revealed ? "Hide" : "Reveal"}
            </button>
          )}
          {rows && rows.length > 0 && (
            <button
              onClick={copyAll}
              className="flex min-w-0 items-center justify-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm font-medium hover:bg-surface-3"
            >
              <Copy className="size-4" /> Copy all
            </button>
          )}
          {total > 0 && confirmRegenerate ? (
            <div className="col-span-2 flex min-w-0 flex-wrap items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-1 sm:col-span-1">
              <span className="grow px-2 text-xs text-destructive">Replace all codes?</span>
              <button
                type="button"
                onClick={generate}
                disabled={busy}
                className="flex min-w-0 items-center justify-center gap-2 rounded-md bg-destructive px-3 py-1.5 text-sm font-medium text-destructive-foreground disabled:opacity-60"
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                {busy ? "Regenerating…" : "Yes, regenerate all"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmRegenerate(false)}
                disabled={busy}
                className="px-3 py-1.5 rounded-md bg-surface-2 border border-border text-sm font-medium disabled:opacity-60"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => total === 0 ? generate() : setConfirmRegenerate(true)}
              disabled={busy}
              className="col-span-2 flex min-w-0 items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60 sm:col-span-1"
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
              {busy ? "Generating…" : total === 0 ? "Generate codes" : "Regenerate all"}
            </button>
          )}
        </div>
      </div>

      {low && (
        <div className="mb-3 text-xs px-3 py-2 rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-400">
          You're running low on backup codes. Regenerate a new batch and store them safely.
        </div>
      )}

      <Dialog open={!!fresh} onOpenChange={(open) => { if (!open) setFresh(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LifeBuoy className="size-5 text-primary" /> New recovery codes generated
            </DialogTitle>
            <DialogDescription>
              Save these codes somewhere safe — they will not be shown again. Each code can only be used once.
            </DialogDescription>
          </DialogHeader>

          {fresh && (
            <>
              <div className="rounded-xl border border-primary/40 bg-primary/5 p-4">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 font-mono text-sm">
                  {fresh.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => copySingle(c)}
                      title="Click to copy"
                      className="px-2 py-2 rounded-md bg-background border border-border text-center tracking-wider hover:bg-surface-2 cursor-pointer select-all"
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              <DialogFooter className="flex-col sm:flex-row gap-2">
                <button onClick={copyAll} className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-surface-2 border border-border text-sm font-medium hover:bg-surface-3">
                  <Copy className="size-4" /> Copy all
                </button>
                <button onClick={download} className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-surface-2 border border-border text-sm font-medium hover:bg-surface-3">
                  <Download className="size-4" /> Download
                </button>
                <button onClick={() => setFresh(null)} className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90">
                  Done
                </button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {rows && rows.length > 0 && (
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Current batch ({rows.length})</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 font-mono text-sm">
            {rows.map((r, i) => {
              const displayCode = r.code ?? `Code #${String(i + 1).padStart(2, "0")}`;
              const maskedCode = displayCode.replace(/[A-Z0-9]/g, "•");
              return (
                <div
                  key={r.id}
                  role={!r.used_at && r.code ? "button" : undefined}
                  tabIndex={!r.used_at && r.code ? 0 : undefined}
                  onClick={() => { if (!r.used_at && r.code) copySingle(r.code); }}
                  onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && !r.used_at && r.code) { e.preventDefault(); copySingle(r.code); } }}
                  className={`flex items-center justify-between gap-2 px-2 py-1.5 rounded-md border ${r.used_at ? "bg-surface-2 border-border text-muted-foreground" : "bg-background border-border hover:bg-surface-2 cursor-pointer"}`}
                  title={r.used_at ? `Used ${new Date(r.used_at).toLocaleString("en-GB")}` : revealed ? "Click to copy" : "Reveal to view code"}
                >
                  <span className={`tracking-wider select-all ${r.used_at ? "line-through" : ""}`}>
                    {revealed ? displayCode : maskedCode}
                  </span>
                  {!r.used_at && r.code && (
                    <Copy className="size-3.5 text-muted-foreground shrink-0" />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {rows && rows.length === 0 && !fresh && (
        <div className="text-sm text-muted-foreground">No backup codes yet. Generate a batch to keep handy in case you ever lose access.</div>
      )}
    </section>
  );
}
function ThemePickerCard() {
  const current = useDefaultAppTheme();
  const choose = async (theme: Parameters<typeof setAppTheme>[0]) => {
    try {
      await setAppTheme(theme);
      const name = APP_THEME_OPTIONS.find((option) => option.value === theme)?.name ?? theme;
      toast.success(`Default theme set to ${name}`);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to update theme");
    }
  };
  return (
    <ThemePicker
      current={current}
      onChoose={choose}
      title="App settings — default theme"
      description="Choose the starting theme for users who have not selected their own theme."
    />
  );
}
