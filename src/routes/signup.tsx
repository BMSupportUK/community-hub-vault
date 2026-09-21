import { createFileRoute, Link, useNavigate, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Field } from "./login";
import signupIllustration from "@/assets/signup-illustration.webp";
import { recordSignupInfo } from "@/lib/signup-info.functions";
import { TurnstileWidget } from "@/components/app/TurnstileWidget";
import { verifyTurnstile } from "@/lib/turnstile.functions";
import { useVisitorVpnStatus, refreshVisitorVpn } from "@/hooks/use-visitor-vpn";
import { assertSignupAllowed } from "@/lib/vpn-public-check.functions";
import { isVpnBypassEmail } from "@/lib/vpn-bypass";
import { VpnBlockedDialog } from "@/components/VpnBlockedDialog";
import { ShieldAlert, Loader2, RefreshCw } from "lucide-react";
import { useViewportLockable } from "@/hooks/use-viewport-lock";

export const Route = createFileRoute("/signup")({
  validateSearch: (search: Record<string, unknown>): { invite?: string } => ({
    invite: typeof search.invite === "string" ? search.invite : undefined,
  }),
  beforeLoad: async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) throw redirect({ to: "/home" });
  },
  component: SignupPage,
});

function IntentChoice({
  intent,
  setIntent,
}: {
  intent: "bm-support" | "fan-zone" | "";
  setIntent: (v: "bm-support" | "fan-zone") => void;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-semibold text-foreground mb-2">
        Which part of the site would you like to register for?{" "}
        <span className="text-destructive">*</span>
      </legend>
      <label
        className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
          intent === "bm-support"
            ? "border-primary bg-primary/10"
            : "border-border hover:border-primary/40 hover:bg-muted/30"
        }`}
      >
        <input
          type="radio"
          name="intent"
          value="bm-support"
          checked={intent === "bm-support"}
          onChange={() => setIntent("bm-support")}
          className="mt-0.5 accent-primary"
        />
        <span className="text-sm">
          <span className="block font-semibold">BM Support</span>
          <span className="block text-xs text-muted-foreground">
            Customer support, tickets, devices and orders.
          </span>
        </span>
      </label>
      <label
        className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
          intent === "fan-zone"
            ? "border-primary bg-primary/10"
            : "border-border hover:border-primary/40 hover:bg-muted/30"
        }`}
      >
        <input
          type="radio"
          name="intent"
          value="fan-zone"
          checked={intent === "fan-zone"}
          onChange={() => setIntent("fan-zone")}
          className="mt-0.5 accent-primary"
        />
        <span className="text-sm">
          <span className="block font-semibold">Boro Fan Zone (Middlesbrough F.C. Forum)</span>
          <span className="block text-xs text-muted-foreground">
            Match-day banter, transfer talk and the forum.
          </span>
        </span>
      </label>
    </fieldset>
  );
}

function SignupPage() {
  const lockable = useViewportLockable();
  const navigate = useNavigate();
  const { invite: inviteFromUrl } = Route.useSearch();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [inviteCode, setInviteCode] = useState(inviteFromUrl ?? "");
  const [busy, setBusy] = useState(false);
  const [captchaToken, setCaptchaToken] = useState("");
  const [intent, setIntent] = useState<"bm-support" | "fan-zone" | "">("");
  const vpnStatus = useVisitorVpnStatus();
  const [vpnDialogOpen, setVpnDialogOpen] = useState(false);
  const [rechecking, setRechecking] = useState(false);
  const [serverBlock, setServerBlock] = useState<"vpn" | "unverified" | null>(null);
  const [emailTaken, setEmailTaken] = useState(false);

  // Live check: warn as soon as a registered email is entered, before submitting.
  useEffect(() => {
    const trimmed = email.trim();
    if (!trimmed || !trimmed.includes("@") || !trimmed.includes(".")) {
      setEmailTaken(false);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const { data: exists, error } = await supabase.rpc("email_is_account_holder", {
          _email: trimmed,
        });
        if (!cancelled && !error) setEmailTaken(exists === true);
      } catch {
        if (!cancelled) setEmailTaken(false);
      }
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [email]);

  const bypass = isVpnBypassEmail(email);
  const checking = !bypass && (vpnStatus === "checking" || rechecking);
  const blocked =
    !bypass && (vpnStatus === "protected" || vpnStatus === "unavailable" || !!serverBlock);
  const blockedForVpn = vpnStatus === "protected" || serverBlock === "vpn";
  const needsReferral = intent === "bm-support" && !inviteCode.trim();

  const recheck = async () => {
    setRechecking(true);
    setServerBlock(null);
    try {
      await refreshVisitorVpn();
    } finally {
      setRechecking(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (blocked || checking) {
      setVpnDialogOpen(true);
      return;
    }
    if (!intent) return toast.error("Please choose what you'd like access to.");
    if (intent === "bm-support" && !inviteCode.trim()) {
      return toast.error("A referral code is required for BM Support access.");
    }
    if (!captchaToken) return toast.error("Please complete the captcha.");
    setBusy(true);
    // Server-side gate on the real request IP — must pass before any account exists.
    try {
      const gate = await assertSignupAllowed({ data: { email } });
      if (!gate.allowed) {
        setBusy(false);
        setServerBlock(gate.reason === "vpn" ? "vpn" : "unverified");
        setVpnDialogOpen(true);
        return;
      }
    } catch {
      setBusy(false);
      setServerBlock("unverified");
      setVpnDialogOpen(true);
      return;
    }
    const verify = await verifyTurnstile({ data: { token: captchaToken } });
    if (!verify.success) {
      setBusy(false);
      setCaptchaToken("");
      return toast.error("Captcha verification failed. Please try again.");
    }
    if (emailTaken) {
      setBusy(false);
      return toast.error("That email address is already signed up — please sign in instead.");
    }
    // Block emails that already have an account — signUp itself won't tell us.
    try {
      const { data: exists, error: existsError } = await supabase.rpc("email_is_account_holder", {
        _email: email.trim(),
      });
      if (!existsError && exists) {
        setBusy(false);
        return toast.error("That email address is already signed up — please sign in instead.");
      }
    } catch {
      // If the check fails, fall through to signUp.
    }
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: {
          display_name: displayName,
          username: displayName.toLowerCase().replace(/\s+/g, ""),
          access_intent: intent,
        },
      },
    });
    if (error) {
      setBusy(false);
      return toast.error(error.message);
    }
    // Capture as much client/browser info as we can for owner review
    try {
      const nav = navigator as Navigator & {
        deviceMemory?: number;
        connection?: { effectiveType?: string; downlink?: number; rtt?: number; saveData?: boolean };
      };
      const conn = nav.connection;
      const client: Record<string, unknown> = {
        access_intent: intent,
        userAgent: navigator.userAgent,
        language: navigator.language,
        languages: (navigator.languages ?? []).join(","),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        screen: `${window.screen.width}x${window.screen.height}@${window.devicePixelRatio}x`,
        viewport: `${window.innerWidth}x${window.innerHeight}`,
        platform: navigator.platform,
        vendor: navigator.vendor,
        referrer: document.referrer || null,
        url: window.location.href,
        deviceMemory: nav.deviceMemory ?? null,
        hwConcurrency: navigator.hardwareConcurrency ?? null,
        connection: conn
          ? `${conn.effectiveType ?? "?"} · ${conn.downlink ?? "?"}Mbps · rtt ${conn.rtt ?? "?"}ms${conn.saveData ? " · saveData" : ""}`
          : null,
        cookieEnabled: navigator.cookieEnabled,
        timestamp: new Date().toISOString(),
      };
      await recordSignupInfo({ data: { client } });
    } catch (e) {
      console.error("signup info capture failed", e);
    }
    if (inviteCode.trim()) {
      const { error: redeemError } = await supabase.rpc("redeem_invite", { p_code: inviteCode.trim() });
      if (redeemError) {
        setBusy(false);
        toast.error(`Invite code: ${redeemError.message}`);
        if (intent === "fan-zone") navigate({ to: "/fan-zone-pending" });
        else navigate({ to: "/gate", search: { intent, invite: inviteCode.trim() } });
        return;
      }
      // Valid invite → user is auto-approved as nonsubscriber; skip the gate for BM Support.
      if (intent !== "fan-zone") {
        setBusy(false);
        toast.success("Welcome — invite accepted.");
        navigate({ to: "/home" });
        return;
      }
    }
    setBusy(false);
    if (intent === "fan-zone") {
      // The account trigger atomically queues the Fan Zone membership request.
      toast.success("Account created. A Fan Zone moderator will review your request.");

      navigate({ to: "/fan-zone-pending" });
    } else {
      toast.success("Account created. A moderator will review your request.");
      navigate({ to: "/gate", search: { intent } });
    }
  };

  return (
    <div
      className={
        (lockable
          ? "fixed inset-0 grid h-dvh w-dvw overflow-hidden"
          : "grid min-h-dvh w-full") +
        " bg-background lg:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_300px]"
      }
    >
      {/* Illustration panel */}
      <aside className="relative hidden lg:flex items-center justify-center overflow-hidden bg-gradient-to-br from-fuchsia-700/40 via-violet-600/30 to-blue-700/40 border-r border-border">
        <div className="absolute -top-32 -left-24 size-[28rem] rounded-full bg-fuchsia-600/30 blur-3xl" />
        <div className="absolute -bottom-32 -right-24 size-[28rem] rounded-full bg-blue-600/30 blur-3xl" />
        <div className="absolute top-1/3 right-10 size-72 rounded-full bg-violet-500/20 blur-3xl" />
        <div className="relative z-10 flex max-h-full max-w-lg flex-col items-center justify-center px-10 py-6 text-center">
          <img
            src={signupIllustration}
            alt="Illustration of a person creating a new account on a computer"
            width={1024}
            height={1024}
            loading="lazy"
            className="h-auto max-h-[45vh] w-auto max-w-full drop-shadow-[0_25px_60px_rgba(217,70,239,0.45)]"
          />
          <h2 className="font-display text-2xl font-bold mt-4 text-foreground">
            Join the community
          </h2>
          <p className="text-sm text-muted-foreground mt-2">
            Create your account to help customers, join channels, and track your shifts together.
          </p>
        </div>
      </aside>

      {/* Form panel */}
      <main className={`flex min-h-0 flex-col items-start px-4 pt-10 pb-5 ${lockable ? "overflow-y-auto" : ""}`}>
        <div className="mx-auto w-full min-w-0 max-w-md">
          <Link to="/" className="flex items-center gap-2 justify-center mb-1">
            <div className="size-9 rounded-xl bg-gradient-primary shadow-glow grid place-items-center font-display font-bold text-[13px] text-primary-foreground">BM</div>
            <span className="font-display font-bold text-lg">Support Community</span>
          </Link>
          <div className="bg-surface/80 backdrop-blur-sm border border-border rounded-2xl p-5 sm:p-8 shadow-soft">
            <h1 className="font-display text-2xl font-bold">Join BM Support</h1>
            <p className="text-sm text-muted-foreground mb-6">A moderator will review your request before you get in.</p>
            <form onSubmit={submit} className="space-y-3">
              {/* On small screens the registration choice is part of the form; on lg+ it moves to the sidebar */}
              <div className="lg:hidden">
                <IntentChoice intent={intent} setIntent={setIntent} />
              </div>
              <Field label="Display name" value={displayName} onChange={setDisplayName} />
              <Field label="Email" type="email" value={email} onChange={setEmail} />
              {emailTaken && (
                <div className="flex items-start gap-2 text-xs text-destructive -mt-1">
                  <ShieldAlert className="size-3.5 mt-0.5 shrink-0" />
                  <span>
                    That email address is already signed up — please{" "}
                    <Link
                      to="/login"
                      className="inline-flex items-center rounded-md border border-destructive/60 bg-destructive/10 px-2 py-0.5 font-semibold hover:bg-destructive/20"
                    >
                      sign in
                    </Link>{" "}
                    instead.
                  </span>
                </div>
              )}
              <Field label="Password" type="password" value={password} onChange={setPassword} />
              {intent === "bm-support" && (
                <>
                  <Field
                    label={
                      <span>
                        Referral code{" "}
                        <span className="text-destructive">*</span>
                      </span>
                    }
                    value={inviteCode}
                    onChange={setInviteCode}
                    required
                  />
                  <p className="text-xs text-muted-foreground -mt-1">
                    BM Support registration requires a referral code from an existing member.
                  </p>
                </>
              )}
              <TurnstileWidget onToken={setCaptchaToken} onExpire={() => setCaptchaToken("")} />

              {checking && (
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" /> Checking your connection…
                </p>
              )}

              {!checking && blocked && (
                <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 space-y-2">
                  <p className="flex items-start gap-2 text-sm font-medium text-destructive">
                    <ShieldAlert className="size-4 mt-0.5 shrink-0" />
                    {blockedForVpn
                      ? "Please disable your VPN or proxy to create an account, then press Re-check."
                      : "We couldn't verify your connection. Please disable any VPN or proxy and press Re-check."}
                  </p>
                  <button
                    type="button"
                    onClick={recheck}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
                  >
                    <RefreshCw className="size-3.5" /> Re-check
                  </button>
                </div>
              )}

              {blocked || checking ? (
                <button
                  type="button"
                  onClick={() => setVpnDialogOpen(true)}
                  aria-disabled="true"
                  className="w-full h-11 rounded-lg bg-primary/50 text-primary-foreground font-medium cursor-not-allowed inline-flex items-center justify-center gap-2"
                >
                  <ShieldAlert className="size-4" /> Join BM Support
                </button>
              ) : (
                <>
                <button
                  disabled={busy || !intent || needsReferral}
                  className="w-full h-11 rounded-lg bg-primary text-primary-foreground font-medium shadow-glow hover:opacity-90 disabled:opacity-50 disabled:shadow-none"
                >
                  {busy ? "Creating…" : "Join BM Support"}
                </button>
                {!intent && (
                  <p className="text-xs text-muted-foreground text-center -mt-1">
                    Choose which part of the site you'd like to register for to continue.
                  </p>
                )}
                {intent === "bm-support" && needsReferral && (
                  <p className="text-xs text-muted-foreground text-center -mt-1">
                    Enter your referral code to continue.
                  </p>
                )}
                </>
              )}
            </form>
            <div className="text-sm text-muted-foreground text-center mt-6">
              Already in?{" "}
              <Link to="/login" className="text-primary hover:underline">Sign in</Link>
            </div>
          </div>
        </div>
      </main>

      {/* Sidebar — which part of the site to register for (advert removed from this page; lg+ only, small screens show it inside the form) */}
      <aside
        className={`hidden lg:flex min-h-0 flex-col items-center justify-center px-4 pt-2 pb-5 lg:border-l lg:border-border/60 ${
          lockable ? "overflow-y-auto" : ""
        }`}
      >
        <div className="w-full max-w-md">
          <div className="bg-surface/80 backdrop-blur-sm border border-border rounded-2xl p-5 sm:p-6 shadow-soft">
            <IntentChoice intent={intent} setIntent={setIntent} />
          </div>
        </div>
      </aside>

      <VpnBlockedDialog open={vpnDialogOpen} onOpenChange={setVpnDialogOpen} />
    </div>
  );
}
