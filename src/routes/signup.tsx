import { createFileRoute, Link, useNavigate, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Field } from "./login";
import signupIllustration from "@/assets/signup-illustration.png";
import { recordSignupInfo } from "@/lib/signup-info.functions";

export const Route = createFileRoute("/signup")({
  beforeLoad: async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) throw redirect({ to: "/home" });
  },
  component: SignupPage,
});

function SignupPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { display_name: displayName, username: displayName.toLowerCase().replace(/\s+/g, "") },
      },
    });
    if (error) {
      setBusy(false);
      return toast.error(error.message);
    }
    // Capture as much client/browser info as we can for admin review
    try {
      const nav = navigator as Navigator & {
        deviceMemory?: number;
        connection?: { effectiveType?: string; downlink?: number; rtt?: number; saveData?: boolean };
      };
      const conn = nav.connection;
      // Ask for precise geolocation (best-effort, non-blocking up to 6s)
      const geo = await new Promise<{
        geoLatitude: number | null;
        geoLongitude: number | null;
        geoAccuracyM: number | null;
        geoPermission: string;
      }>((resolve) => {
        if (!("geolocation" in navigator)) {
          return resolve({ geoLatitude: null, geoLongitude: null, geoAccuracyM: null, geoPermission: "unsupported" });
        }
        const done = (v: Parameters<typeof resolve>[0]) => resolve(v);
        const timeout = setTimeout(
          () => done({ geoLatitude: null, geoLongitude: null, geoAccuracyM: null, geoPermission: "timeout" }),
          6000,
        );
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            clearTimeout(timeout);
            done({
              geoLatitude: pos.coords.latitude,
              geoLongitude: pos.coords.longitude,
              geoAccuracyM: pos.coords.accuracy,
              geoPermission: "granted",
            });
          },
          (err) => {
            clearTimeout(timeout);
            done({
              geoLatitude: null,
              geoLongitude: null,
              geoAccuracyM: null,
              geoPermission: err.code === 1 ? "denied" : err.code === 2 ? "unavailable" : "error",
            });
          },
          { enableHighAccuracy: false, timeout: 5500, maximumAge: 60000 },
        );
      });
      const client: Record<string, unknown> = {
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
        ...geo,
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
        navigate({ to: "/gate" });
        return;
      }
    }
    setBusy(false);
    toast.success("Account created. A moderator will review your request.");
    navigate({ to: "/gate" });
  };

  return (
    <div className="min-h-screen w-full grid lg:grid-cols-2 bg-background">
      {/* Illustration panel */}
      <aside className="relative hidden lg:flex items-center justify-center overflow-hidden bg-gradient-to-br from-fuchsia-700/40 via-violet-600/30 to-blue-700/40 border-r border-border">
        <div className="absolute -top-32 -left-24 size-[28rem] rounded-full bg-fuchsia-600/30 blur-3xl" />
        <div className="absolute -bottom-32 -right-24 size-[28rem] rounded-full bg-blue-600/30 blur-3xl" />
        <div className="absolute top-1/3 right-10 size-72 rounded-full bg-violet-500/20 blur-3xl" />
        <div className="relative z-10 max-w-lg px-10 text-center">
          <img
            src={signupIllustration}
            alt="Illustration of a person creating a new account on a computer"
            width={1024}
            height={1024}
            loading="lazy"
            className="w-full h-auto drop-shadow-[0_25px_60px_rgba(217,70,239,0.45)]"
          />
          <h2 className="font-display text-2xl font-bold mt-6 text-foreground">
            Join the community
          </h2>
          <p className="text-sm text-muted-foreground mt-2">
            Create your account to help customers, join channels, and track your shifts together.
          </p>
        </div>
      </aside>

      {/* Form panel */}
      <main className="flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          <Link to="/" className="flex items-center gap-2 justify-center mb-8">
            <div className="size-9 rounded-xl bg-gradient-primary shadow-glow grid place-items-center font-display font-bold text-[13px] text-primary-foreground">BM</div>
            <span className="font-display font-bold text-lg">Support Community</span>
          </Link>
          <div className="bg-surface/80 backdrop-blur-sm border border-border rounded-2xl p-8 shadow-soft">
            <h1 className="font-display text-2xl font-bold">Request access</h1>
            <p className="text-sm text-muted-foreground mb-6">A moderator will review your request before you get in.</p>
            <form onSubmit={submit} className="space-y-3">
              <Field label="Display name" value={displayName} onChange={setDisplayName} />
              <Field label="Email" type="email" value={email} onChange={setEmail} />
              <Field label="Password" type="password" value={password} onChange={setPassword} />
              <Field label="Invite code (optional)" value={inviteCode} onChange={setInviteCode} />
              <button disabled={busy} className="w-full h-11 rounded-lg bg-primary text-primary-foreground font-medium shadow-glow hover:opacity-90 disabled:opacity-50">
                {busy ? "Creating…" : "Request access"}
              </button>
            </form>
            <div className="text-sm text-muted-foreground text-center mt-6">
              Already in?{" "}
              <Link to="/login" className="text-primary hover:underline">Sign in</Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
