import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Send, Ban, X, LogOut, ShieldCheck, FileText, MessageSquarePlus, Check, CheckCheck, AlertCircle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { verifyTurnstile } from "@/lib/turnstile.functions";
import { TurnstileWidget } from "@/components/app/TurnstileWidget";
import bg from "@/assets/gate-bg.jpg";
import mentionAudio from "@/assets/mention-notify.mp3";
import ticketAudio from "@/assets/ticket-notify.mp3";
import { playSound } from "@/lib/sound";
import { MentionText } from "@/components/app/mentions";
import { GateStaffPresence } from "@/components/app/GateStaffPresence";
import { BmSplash } from "@/components/app/BmSplash";
import { useVisitorVpnStatus } from "@/hooks/use-visitor-vpn";
import { MapPin } from "lucide-react";
import { recordMyGpsLocation } from "@/lib/gps-capture.functions";
import { getLocationPermission, readPosition } from "@/lib/location-permission";

export const Route = createFileRoute("/_authenticated/gate")({
  head: () => ({
    meta: [
      { title: "Account Access | BM Support" },
      { name: "description", content: "Check the status of your BM Support account access." },
      { property: "og:title", content: "Account Access | BM Support" },
      { property: "og:description", content: "Check the status of your BM Support account access." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): { intent?: "fan-zone" | "bm-support"; invite?: string } => ({
    intent:
      search.intent === "fan-zone" || search.intent === "bm-support"
        ? (search.intent as "fan-zone" | "bm-support")
        : undefined,
    invite: typeof search.invite === "string" ? search.invite : undefined,
  }),
  component: GatePage,
});

type MsgStatus = "sending" | "sent" | "failed";
interface Msg { id: string; sender_id: string; content: string; created_at: string; status?: MsgStatus; }

function GatePage() {
  const { user, refreshRoles, signOut } = useAuth();
  const refreshRolesRef = useRef(refreshRoles);
  refreshRolesRef.current = refreshRoles;
  const navigate = useNavigate();
  const { intent, invite: inviteFromUrl } = Route.useSearch();
  const isFanZone = intent === "fan-zone";
  const intentLabel = isFanZone ? "Boro Fan Zone" : "BM Support";
  const [appId, setAppId] = useState<string | null>(null);
  const [ticketNumber, setTicketNumber] = useState<number | null>(null);
  const [status, setStatus] = useState<string>("pending");
  const [reason, setReason] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [chatOpen, setChatOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [reasonDraft, setReasonDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [confirmNew, setConfirmNew] = useState(false);
  const [senderNames, setSenderNames] = useState<Record<string, string>>({});
  const scrollerRef = useRef<HTMLDivElement>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const [peerTyping, setPeerTyping] = useState<{ id: string; name?: string } | null>(null);
  const peerTypingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSent = useRef<number>(0);
  const [captchaPassed, setCaptchaPassed] = useState(false);
  const [captchaOpen, setCaptchaOpen] = useState(false);
  const [captchaToken, setCaptchaToken] = useState("");
  const [verifyingCaptcha, setVerifyingCaptcha] = useState(false);
  const [pendingAction, setPendingAction] = useState<"chat" | "form" | null>(null);
  const verifyCaptcha = useServerFn(verifyTurnstile);
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [referralNote, setReferralNote] = useState<string | null>(null);
  const [referralChecking, setReferralChecking] = useState(true);
  const visitorVpn = useVisitorVpnStatus();
  const recordGps = useServerFn(recordMyGpsLocation);
  // Direct (non-referral) BM Support applicants must allow location before requesting access.
  const [locState, setLocState] = useState<"checking" | "ask" | "granted" | "refused" | "skip">("checking");
  const [locBusy, setLocBusy] = useState(false);
  // Backup referral question for applicants who didn't enter a code on the form.
  const [refAsk, setRefAsk] = useState<"pending" | "question" | "enter" | "done">("pending");
  const [refInput, setRefInput] = useState("");
  const [refBusy, setRefBusy] = useState(false);
  const [refErr, setRefErr] = useState<string | null>(null);
  const [refAnswer, setRefAnswer] = useState<"no" | null>(null);

  useEffect(() => {
    if (referralChecking || !user?.id) return;
    if (isFanZone || referralCode) {
      setRefAsk("done");
      return;
    }
    const saved = sessionStorage.getItem(`gate-ref-answer:${user.id}`);
    if (saved === "no") {
      setRefAnswer("no");
      setRefAsk("done");
    } else {
      setRefAsk("question");
    }
  }, [referralChecking, user?.id, isFanZone, referralCode]);

  const answerNoReferral = () => {
    if (user?.id) sessionStorage.setItem(`gate-ref-answer:${user.id}`, "no");
    setRefAnswer("no");
    setRefAsk("done");
  };

  const submitReferral = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = refInput.trim();
    if (!code) return toast.error("Please enter your referral code.");
    setRefBusy(true);
    setRefErr(null);
    const { error } = await supabase.rpc("redeem_invite", { p_code: code });
    if (error) {
      setRefBusy(false);
      setRefErr("That referral code isn't valid. Please check it and try again, or tap \"I don't have a code\" to continue without one.");
      return;
    }
    await refreshRolesRef.current();
    setRefBusy(false);
    toast.success("Referral code accepted — welcome.");
    navigate({ to: "/home" });
  };

  const saveCoords = async (c: { latitude: number; longitude: number; accuracy?: number | null }) => {
    await recordGps({ data: { latitude: c.latitude, longitude: c.longitude, accuracy: c.accuracy } }).catch(
      (err) => console.warn("[gate] GPS save failed", err),
    );
  };

  useEffect(() => {
    if (referralChecking || !user?.id) return;
    if (isFanZone || referralCode) {
      setLocState("skip");
      return;
    }
    let cancelled = false;
    void (async () => {
      const perm = await getLocationPermission();
      if (cancelled) return;
      if (perm === "granted") {
        setLocState("granted");
        const res = await readPosition();
        if (res.ok) await saveCoords(res.coords);
      } else if (perm === "denied") {
        setLocState("refused");
      } else if (perm === "unsupported") {
        setLocState("skip");
      } else {
        setLocState(sessionStorage.getItem(`gate-loc-refused:${user.id}`) ? "refused" : "ask");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [referralChecking, user?.id, isFanZone, referralCode]);

  const refuseLocation = () => {
    if (user?.id) sessionStorage.setItem(`gate-loc-refused:${user.id}`, "1");
    setLocState("refused");
  };

  const allowLocation = async () => {
    setLocBusy(true);
    const res = await readPosition();
    setLocBusy(false);
    if (res.ok) {
      if (user?.id) sessionStorage.removeItem(`gate-loc-refused:${user.id}`);
      setLocState("granted");
      await saveCoords(res.coords);
      toast.success("Thanks — location confirmed.");
    } else if (res.denied) {
      if ((await getLocationPermission()) === "denied")
        toast.error("Location is blocked in your browser. Turn it on in your browser's site settings, then try again.");
      refuseLocation();
    } else {
      toast.error("We couldn't read your location. Please try again.");
    }
  };

  const ACTIVATION_TEXT = "I would like to complete activation of my account.";
  const defaultDraft = (code?: string | null) =>
    `${ACTIVATION_TEXT}${code ? `\n\nReferral code: ${code}` : ""}`;

  const requestAccess = (action: "chat" | "form") => {
    if (action === "form" && !reasonDraft && !appId) {
      setReasonDraft(defaultDraft(referralCode));
    }

    if (captchaPassed) {
      if (action === "chat") setChatOpen(true);
      else setFormOpen(true);
      return;
    }
    setPendingAction(action);
    setCaptchaToken("");
    setCaptchaOpen(true);
  };

  const submitCaptcha = async () => {
    if (!captchaToken) {
      toast.error("Please complete the captcha.");
      return;
    }
    setVerifyingCaptcha(true);
    try {
      const res = await verifyCaptcha({ data: { token: captchaToken } });
      if (!res?.success) {
        toast.error("Captcha verification failed. Please try again.");
        setCaptchaToken("");
        return;
      }
      setCaptchaPassed(true);
      setCaptchaOpen(false);
      if (pendingAction === "form") setFormOpen(true);
      else setChatOpen(true);
      setPendingAction(null);
    } catch {
      toast.error("Captcha verification failed. Please try again.");
      setCaptchaToken("");
    } finally {
      setVerifyingCaptcha(false);
    }
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("chat") === "1") setChatOpen(true);
  }, []);

  // Look up any referral/invite info for this user. Prefer the ?invite= URL
  // param (in case auto-redeem failed during signup) and fall back to an
  // already-redeemed invite row in the database.
  useEffect(() => {
    if (!user) return;
    setReferralChecking(true);
    let cancelled = false;
    (async () => {
      const urlCode = inviteFromUrl?.trim();
      if (urlCode) {
        // Try to redeem one more time — if it works, auto-approve and leave.
        const { error } = await supabase.rpc("redeem_invite", { p_code: urlCode });
        if (!cancelled) {
          if (!error) {
            toast.success("Invite accepted — welcome.");
            await refreshRolesRef.current();
            navigate({ to: "/home" });
            return;
          }
          // A used code may already belong to this account (signup redeemed
          // it before navigation). Check ownership below before showing gate.
          setReferralNote(error.message);
        }
      }
      // No URL code — check whether an invite is already linked to this user.
      const { data: linked } = await supabase
        .from("invites")
        .select("code")
        .eq("used_by", user.id)
        .maybeSingle();
      if (!cancelled && linked?.code) {
        // Referral code already used → straight access, never the gate.
        const { data: ok } = await supabase.rpc("claim_invite_access");
        if (!cancelled && ok && intent !== "fan-zone") {
          await refreshRolesRef.current();
          navigate({ to: "/home" });
          return;
        }
        setReferralCode(linked.code);
      }
      if (!cancelled && !linked && urlCode) setReferralCode(urlCode);
      if (!cancelled) setReferralChecking(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, inviteFromUrl, intent, navigate]);

  // Once the referral code resolves, fold it into the default activation draft.
  useEffect(() => {
    if (!referralCode || appId) return;
    setReasonDraft((prev) =>
      prev.startsWith(ACTIVATION_TEXT) && !prev.includes(referralCode)
        ? defaultDraft(referralCode)
        : prev,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [referralCode, appId]);


  useEffect(() => {
    if (!user) return;
    (async () => {
      // Pick the most recent ticket for this user
      const { data } = await supabase
        .from("gate_applications")
        .select("id, status, reason, ticket_number")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) {
        setAppId(data.id);
        setStatus(data.status);
        setReason(data.reason);
        setTicketNumber(data.ticket_number ?? null);
        const { data: m } = await supabase.from("gate_messages")
          .select("id, sender_id, content, created_at").eq("application_id", data.id).order("created_at");
        setMsgs((m ?? []) as Msg[]);
      }
    })();
  }, [user]);

  useEffect(() => {
    if (!appId) return;
    const msgCh = supabase
      .channel(`gate-msgs-${appId}`, { config: { broadcast: { self: false } } })
      .on("broadcast", { event: "message" }, ({ payload }) => {
        const msg = payload as Msg;
        setMsgs((m) => (m.some((x) => x.id === msg.id) ? m : [...m, msg]));
        if (user && msg.sender_id !== user.id) {
          playSound(mentionAudio, { label: "gate-msg" });
          toast(`💬 New reply from staff`, {
            description: msg.content.slice(0, 120),
            duration: 6000,
            action: { label: "Open chat", onClick: () => setChatOpen(true) },
          });
        }
      })
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        const p = payload as { sender_id: string; name?: string };
        if (!user || p.sender_id === user.id) return;
        setPeerTyping({ id: p.sender_id, name: p.name });
        if (peerTypingTimer.current) clearTimeout(peerTypingTimer.current);
        peerTypingTimer.current = setTimeout(() => setPeerTyping(null), 3000);
      })
      .subscribe();
    const statusCh = supabase
      .channel(`gate-status-${appId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "gate_applications", filter: `id=eq.${appId}` }, async (p) => {
        const next = (p.new as { status: string }).status;
        const prev = (p.old as { status: string } | undefined)?.status;
        if (prev === next) return;
        setStatus(next);
        playSound(ticketAudio, { label: "gate-status" });
        if (next === "approved") {
          toast.success("✅ You're in! Welcome.", { duration: 8000 });
          await refreshRoles();
        } else if (next === "denied") {
          toast.error("❌ Your request was denied.", { duration: 8000 });
        } else {
          toast(`Your request status is now: ${next}`, { duration: 6000 });
        }
      })
      .subscribe();
    channelRef.current = msgCh;
    return () => {
      channelRef.current = null;
      supabase.removeChannel(msgCh);
      supabase.removeChannel(statusCh);
      if (peerTypingTimer.current) clearTimeout(peerTypingTimer.current);
    };
  }, [appId, refreshRoles]);

  useEffect(() => {
    const ids = Array.from(new Set(msgs.map((m) => m.sender_id))).filter((id) => !senderNames[id]);
    if (ids.length === 0) return;
    supabase.from("profiles").select("id, display_name, username").in("id", ids).then(({ data }) => {
      const next: Record<string, string> = { ...senderNames };
      data?.forEach((p) => { next[p.id] = p.display_name ?? p.username ?? "User"; });
      setSenderNames(next);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [msgs]);

  useEffect(() => {
    if (!chatOpen) return;
    const el = scrollerRef.current;
    if (!el) return;
    // Instant scroll (no smooth) avoids scroll-chaining that "bounces" the page away from the chat.
    el.scrollTop = el.scrollHeight;
  }, [msgs.length, chatOpen]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || !appId || !user) return;
    const content = text.trim(); setText("");
    const tempId = `temp-${crypto.randomUUID()}`;
    const optimistic: Msg = {
      id: tempId,
      sender_id: user.id,
      content,
      created_at: new Date().toISOString(),
      status: "sending",
    };
    setMsgs((m) => [...m, optimistic]);
    const { data: inserted, error } = await supabase
      .from("gate_messages")
      .insert({ application_id: appId, sender_id: user.id, content } as never)
      .select("id, sender_id, content, created_at")
      .single();
    if (error || !inserted) {
      setMsgs((m) => m.map((x) => (x.id === tempId ? { ...x, status: "failed" } : x)));
      toast.error(error?.message ?? "Send failed");
      return;
    }
    const msg: Msg = { ...(inserted as Msg), status: "sent" };
    setMsgs((m) => {
      const withoutTemp = m.filter((x) => x.id !== tempId);
      return withoutTemp.some((x) => x.id === msg.id) ? withoutTemp : [...withoutTemp, msg];
    });
    await channelRef.current?.send({ type: "broadcast", event: "message", payload: msg });
  };

  const notifyTyping = () => {
    if (!user || !channelRef.current) return;
    const now = Date.now();
    if (now - lastTypingSent.current < 1500) return;
    lastTypingSent.current = now;
    channelRef.current.send({
      type: "broadcast",
      event: "typing",
      payload: { sender_id: user.id, name: "You" },
    });
  };

  const submitReason = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = reasonDraft.trim();
    if (trimmed.length < 10) {
      toast.error("Please provide at least 10 characters.");
      return;
    }
    if (trimmed.length > 1000) {
      toast.error("Please keep it under 1000 characters.");
      return;
    }
    if (!user) return;
    // Appeal path: use SECURITY DEFINER RPC so it works for banned/denied users too
    if (trimmed.toUpperCase().startsWith("[APPEAL]")) {
      setSubmitting(true);
      const baseAppeal = trimmed.replace(/^\[APPEAL\]\s*/i, "").trim() || trimmed;
      const appealText =
        locState === "refused"
          ? `${baseAppeal}\n\n📍 Applicant REFUSED location access at the security gate.`.slice(0, 1000)
          : baseAppeal;
      const { data, error } = await supabase.rpc("submit_appeal", { p_reason: appealText });
      if (error) {
        setSubmitting(false);
        toast.error(error.message);
        return;
      }
      const result = data as { application_id: string; ticket_number: number; reference: string } | null;
      if (result) {
        setAppId(result.application_id);
        setTicketNumber(result.ticket_number);
        setStatus("pending");
        setReason(`[APPEAL] ${appealText}`);
        const { data: m } = await supabase
          .from("gate_messages")
          .select("id, sender_id, content, created_at")
          .eq("application_id", result.application_id)
          .order("created_at");
        setMsgs((m ?? []) as Msg[]);
        await refreshRoles();
        toast.success(`Appeal submitted — reference ${result.reference}`);
      }
      setReasonDraft("");
      setFormOpen(false);
      setChatOpen(true);
      setSubmitting(false);
      setConfirmNew(false);
      return;
    }
    // Safeguard: if a pending ticket already exists, require explicit confirmation
    if (appId && status === "pending" && !confirmNew) {
      setConfirmNew(true);
      return;
    }
    setSubmitting(true);
    // Always create a brand-new access ticket
    const { data: created, error } = await supabase
      .from("gate_applications")
      .insert({ user_id: user.id, reason: trimmed })
      .select("id, ticket_number, status, reason")
      .single();
    if (error || !created) {
      setSubmitting(false);
      toast.error(error?.message ?? "Could not create ticket.");
      return;
    }
    const referralLine = referralCode
      ? `\n\n🎟️ Referral code: ${referralCode}${referralNote ? ` (auto-redeem failed: ${referralNote})` : " (already redeemed)"}`
      : "";
    // Advise staff when the applicant is on a VPN/proxy so they can run checks.
    const noRefLine = refAnswer === "no" ? `\n\n🎟️ Referral code: none (applicant answered No)` : "";
    const vpnLine =
      visitorVpn === "protected"
        ? `\n\n⚠️ VPN/proxy detected on this connection — staff please run extra security checks before approving.`
        : "";
    await supabase.from("gate_messages").insert({
      application_id: created.id,
      sender_id: user.id,
      content: `Access ticket #GATE-${String(created.ticket_number).padStart(6, "0")}\n\n${trimmed}${referralLine}${noRefLine}${vpnLine}`,
    } as never);
    setAppId(created.id);
    setTicketNumber(created.ticket_number);
    setStatus(created.status);
    setReason(trimmed);
    setReasonDraft("");
    // Load messages for the new ticket
    const { data: m } = await supabase
      .from("gate_messages")
      .select("id, sender_id, content, created_at")
      .eq("application_id", created.id)
      .order("created_at");
    setMsgs((m ?? []) as Msg[]);
    setFormOpen(false);
    setChatOpen(true);
    setSubmitting(false);
    setConfirmNew(false);
    toast.success(`Ticket #GATE-${String(created.ticket_number).padStart(6, "0")} created.`);
  };

  const openChatOrForm = () => {
    requestAccess("chat");
  };

  if (referralChecking || locState === "checking" || refAsk === "pending")
    return <BmSplash label="Checking your access…" />;

  if ((refAsk === "question" || refAsk === "enter") && status !== "approved") {
    return (
      <div className="fixed inset-0 overflow-hidden bg-black">
        <img src={bg} alt="" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/30 to-black/80" />
        <div className="relative z-10 min-h-screen flex items-center justify-center px-6">
          <div className="w-full max-w-md rounded-2xl border border-white/15 bg-black/60 backdrop-blur p-5 space-y-4">
            <div className="flex items-center gap-2 text-white/70 text-xs font-semibold uppercase tracking-wide">
              <ShieldCheck className="size-4" /> Security chat
            </div>
            <div className="rounded-2xl rounded-tl-sm bg-white/10 px-4 py-3 text-white text-sm">
              Before we continue — were you given a referral code by an existing BM Support member?
            </div>
            {refAsk === "question" ? (
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setRefAsk("enter")}
                  className="px-6 py-2 rounded-full font-semibold text-white bg-gradient-to-r from-violet-600 to-blue-600"
                >
                  Yes
                </button>
                <button
                  onClick={answerNoReferral}
                  className="px-6 py-2 rounded-full font-semibold text-white bg-white/10 border border-white/20"
                >
                  No
                </button>
              </div>
            ) : (
              <>
                <div className="ml-auto w-fit rounded-2xl rounded-tr-sm bg-blue-600 px-4 py-2 text-white text-sm">Yes</div>
                <div className="rounded-2xl rounded-tl-sm bg-white/10 px-4 py-3 text-white text-sm">
                  Great — please type your referral code below.
                </div>
                {refErr && (
                  <div className="rounded-2xl rounded-tl-sm bg-red-500/20 border border-red-500/40 px-4 py-3 text-red-200 text-sm">
                    {refErr}
                  </div>
                )}
                <form onSubmit={submitReferral} className="flex gap-2">
                  <input
                    value={refInput}
                    onChange={(e) => { setRefInput(e.target.value); setRefErr(null); }}
                    placeholder="Referral code"
                    autoFocus
                    className="flex-1 h-10 rounded-lg bg-white/10 border border-white/20 px-3 text-white placeholder:text-white/40"
                  />
                  <button
                    disabled={refBusy}
                    className="px-4 h-10 rounded-lg font-semibold text-white bg-gradient-to-r from-violet-600 to-blue-600 disabled:opacity-60 inline-flex items-center gap-1"
                  >
                    {refBusy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                  </button>
                </form>
                <button onClick={answerNoReferral} className="text-xs text-white/60 underline">
                  I don't have a code
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  const isAppealed = (reason ?? "").toUpperCase().startsWith("[APPEAL]");
  const locationBlocked = locState === "refused" && status !== "approved" && !isAppealed;

  if (locState === "ask" && status !== "approved") {
    return (
      <div className="fixed inset-0 overflow-hidden bg-black">
        <img src={bg} alt="" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/30 to-black/80" />
        <div className="relative z-10 min-h-screen flex flex-col items-center justify-center px-6 text-center">
          <div className="size-20 rounded-full bg-gradient-to-br from-violet-600 to-blue-600 grid place-items-center ring-2 ring-white/20 mb-6">
            <MapPin className="size-10 text-white" strokeWidth={2.5} />
          </div>
          <h1 className="font-display text-3xl md:text-4xl font-extrabold text-white tracking-tight">
            Allow location for account security
          </h1>
          <p className="mt-4 text-white/80 text-base max-w-md">
            We use your location to help protect your account and spot suspicious logins. It's only visible to
            our security staff and never shared. You can turn it off anytime in your browser settings.
          </p>
          <p className="mt-3 text-sm font-semibold text-amber-300 max-w-md">
            Location sharing is mandatory — it's required to protect the security of your account and everyone
            else's. You can't continue without it.
          </p>
          <button
            onClick={allowLocation}
            disabled={locBusy}
            className="mt-8 w-full max-w-md py-3 rounded-lg font-semibold text-white bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 disabled:opacity-60 inline-flex items-center justify-center gap-2"
          >
            {locBusy ? <Loader2 className="size-4 animate-spin" /> : <MapPin className="size-4" />}
            {locBusy ? "Waiting for your browser…" : "Allow location"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 overflow-hidden bg-black">
      {/* Cinematic background */}
      <img src={bg} alt="" className="absolute inset-0 w-full h-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/70" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(220,38,38,0.25),transparent_65%)]" />

      {/* Center card */}
      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center px-6 text-center">
        <div className="size-20 rounded-full bg-gradient-to-br from-violet-600 to-blue-600 grid place-items-center shadow-[0_0_60px_rgba(239,68,68,0.6)] ring-2 ring-red-500/40 mb-6">
          <Ban className="size-10 text-white" strokeWidth={2.5} />
        </div>

        <h1 className="font-display text-4xl md:text-5xl font-extrabold text-white tracking-tight">
          {locationBlocked ? "Location Required" : status === "denied" ? "Account Not Activated" : status === "approved" ? "Access Granted" : "Access Required"}
        </h1>
        <p className="mt-3 text-red-200/90 text-base max-w-md">
          {locationBlocked
            ? "Location sharing is mandatory to protect the security of your account. Direct sign-ups must share their location before requesting access. If you blocked it, turn location on for this site in your browser's site settings, then use the button below to try again."
            : status === "approved"
            ? "Welcome aboard. Refreshing your access…"
            : status === "denied"
            ? "Sorry, we can't activate your account at the moment. If you think this is unfair, please open an appeal."
            : `Your account is awaiting approval for ${intentLabel}.`}
        </p>

        {status !== "approved" && !locationBlocked && (
          <div className="mt-8 w-full max-w-md rounded-xl border border-red-500/40 bg-red-950/30 backdrop-blur-sm p-5 text-left">
            <div className="text-center font-semibold text-white text-sm">What should I do?</div>
            <p className="text-center text-red-100/80 text-sm mt-2">
              You can chat with an owner to request access to {intentLabel}.
            </p>
            <p className="text-center text-red-100/80 text-sm mt-2">
              Click the button below to start a conversation with the {isFanZone ? "Fan Zone moderators" : "support team"}.
            </p>
          </div>
        )}

        {status !== "approved" && !locationBlocked && (
          <button
            onClick={openChatOrForm}
            className="mt-6 w-full max-w-md py-3 rounded-lg font-semibold text-white bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 shadow-[0_8px_30px_rgba(220,38,38,0.45)] transition-all"
          >
            Open ticket & chat with staff
          </button>
        )}

        {locationBlocked && (
          <button
            onClick={() => setLocState("ask")}
            className="mt-6 w-full max-w-md py-3 rounded-lg font-semibold text-white bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 inline-flex items-center justify-center gap-2"
          >
            <MapPin className="size-4" /> Allow location
          </button>
        )}

        {status === "denied" && (
          <button
            onClick={() => {
              setReasonDraft("[APPEAL] ");
              setConfirmNew(false);
              requestAccess("form");
            }}
            className="mt-3 w-full max-w-md py-3 rounded-lg font-semibold text-red-100 bg-white/5 hover:bg-white/10 border border-red-500/40 inline-flex items-center justify-center gap-2 transition-colors"
          >
            <MessageSquarePlus className="size-4" /> Open an appeal
          </button>
        )}

        {status === "approved" && (
          <button
            onClick={async () => {
              await refreshRoles();
              navigate({ to: "/home" });
            }}
            className="mt-6 w-full max-w-md py-3 rounded-lg font-semibold text-white bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 shadow-[0_8px_30px_rgba(16,185,129,0.45)] transition-all inline-flex items-center justify-center gap-2"
          >
            <ShieldCheck className="size-4" /> Continue to dashboard
          </button>
        )}
      </div>

      {/* Subtle sign-out in the corner so it's not confused with the primary action */}
      <button
        onClick={async () => {
          await signOut();
          navigate({ to: "/login" });
        }}
        className="absolute top-4 right-4 z-20 text-xs text-white/40 hover:text-white/80 transition-colors inline-flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-white/5"
      >
        <LogOut className="size-3" /> Sign out
      </button>

      {/* Captcha gate */}
      {captchaOpen && (
        <div className="fixed inset-0 z-[60] grid place-items-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-red-500/30 bg-zinc-950/95 shadow-2xl overflow-hidden">
            <header className="h-14 px-5 flex items-center justify-between border-b border-white/10">
              <div className="flex items-center gap-2">
                <div className="size-8 rounded-full bg-gradient-to-br from-violet-600 to-blue-600 grid place-items-center">
                  <ShieldCheck className="size-4 text-white" />
                </div>
                <div className="font-display font-semibold text-white text-sm">Verify you're human</div>
              </div>
              <button
                type="button"
                onClick={() => { setCaptchaOpen(false); setPendingAction(null); setCaptchaToken(""); }}
                className="text-white/60 hover:text-white"
              >
                <X className="size-5" />
              </button>
            </header>
            <div className="p-5 space-y-4">
              <p className="text-sm text-white/70 text-center">
                Please complete the security check before contacting staff.
              </p>
              <TurnstileWidget
                onToken={setCaptchaToken}
                onExpire={() => setCaptchaToken("")}
              />
            </div>
            <footer className="px-5 py-3 border-t border-white/10 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => { setCaptchaOpen(false); setPendingAction(null); setCaptchaToken(""); }}
                className="text-sm px-3 py-2 rounded-lg text-white/70 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitCaptcha}
                disabled={!captchaToken || verifyingCaptcha}
                className="text-sm px-4 py-2 rounded-lg font-semibold text-white bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 disabled:opacity-50 inline-flex items-center gap-2"
              >
                {verifyingCaptcha && <Loader2 className="size-4 animate-spin" />}
                {verifyingCaptcha ? "Verifying…" : "Continue"}
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* Reason form dialog */}
      {formOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/70 backdrop-blur-sm">
          <form
            onSubmit={submitReason}
            className="w-full max-w-lg rounded-2xl border border-red-500/30 bg-zinc-950/95 shadow-2xl overflow-hidden"
          >
            <header className="h-14 px-5 flex items-center justify-between border-b border-white/10">
              <div className="flex items-center gap-2">
                <div className="size-8 rounded-full bg-gradient-to-br from-violet-600 to-blue-600 grid place-items-center">
                  <FileText className="size-4 text-white" />
                </div>
                <div className="font-display font-semibold text-white text-sm">Access request</div>
              </div>
              <button
                type="button"
                onClick={() => { setFormOpen(false); setConfirmNew(false); }}
                className="text-white/60 hover:text-white"
              >
                <X className="size-5" />
              </button>
            </header>
            <div className="p-5 space-y-4">
              {appId && status === "pending" && ticketNumber !== null && (
                <div className={`rounded-lg border p-3 text-xs ${
                  confirmNew
                    ? "bg-amber-500/10 border-amber-500/40 text-amber-100"
                    : "bg-white/5 border-white/10 text-white/80"
                }`}>
                  {confirmNew ? (
                    <>
                      <div className="font-semibold text-amber-200 mb-1">Open a second ticket?</div>
                      You already have pending ticket{" "}
                      <span className="font-mono">#GATE-{String(ticketNumber).padStart(6, "0")}</span>.
                      Submitting again will create a new one. Click "Submit new ticket" to confirm,
                      or cancel to keep using the existing one.
                    </>
                  ) : (
                    <>
                      You already have a pending ticket{" "}
                      <span className="font-mono">#GATE-{String(ticketNumber).padStart(6, "0")}</span>.
                      You can keep chatting on it instead — submitting will ask before opening a new one.
                    </>
                  )}
                </div>
              )}
              <div>
                <label className="block text-xs uppercase tracking-wider text-red-300/80 mb-2">
                  Why do you need access?
                </label>
                <textarea
                  value={reasonDraft}
                  onChange={(e) => setReasonDraft(e.target.value.slice(0, 1000))}
                  rows={6}
                  required
                  minLength={10}
                  maxLength={1000}
                  placeholder="Tell us who you are, where you found us, and what you'd like to do here…"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-white/40 outline-none focus:border-red-500/50 resize-none"
                  autoFocus
                />
                <div className="flex justify-between mt-1.5 text-[11px]">
                  <span className="text-white/40">Minimum 10 characters</span>
                  <span className="text-white/40">{reasonDraft.length}/1000</span>
                </div>
              </div>
              <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-xs text-red-100/90">
                A moderator will review your request and respond in the chat.
              </div>
            </div>
            <footer className="px-5 py-3 border-t border-white/10 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => { setFormOpen(false); setConfirmNew(false); }}
                className="text-sm px-3 py-2 rounded-lg text-white/70 hover:text-white"
              >
                Cancel
              </button>
              {appId && status === "pending" && (
                <button
                  type="button"
                  onClick={() => { setFormOpen(false); setConfirmNew(false); setChatOpen(true); }}
                  className="text-sm px-3 py-2 rounded-lg text-white/80 hover:text-white border border-white/15"
                >
                  Use existing ticket
                </button>
              )}
              <button
                type="submit"
                disabled={submitting || reasonDraft.trim().length < 10}
                className="text-sm px-4 py-2 rounded-lg font-semibold text-white bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 disabled:opacity-50 shadow-[0_4px_20px_rgba(220,38,38,0.4)]"
              >
                {submitting
                  ? "Submitting…"
                  : confirmNew
                  ? "Submit new ticket"
                  : appId && status === "pending"
                  ? "Submit another"
                  : "Submit request"}
              </button>
            </footer>
          </form>
        </div>
      )}

      {/* Chat dialog */}
      {chatOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-lg h-[640px] max-h-[90vh] rounded-2xl border border-red-500/30 bg-zinc-950/95 shadow-2xl flex flex-col overflow-hidden">
            <header className="h-14 px-5 flex items-center justify-between border-b border-white/10">
              <div className="flex items-center gap-2">
                <div className="size-8 rounded-full bg-gradient-to-br from-violet-600 to-blue-600 grid place-items-center">
                  <Ban className="size-4 text-white" />
                </div>
                <div>
                  <div className="font-display font-semibold text-white text-sm">Support chat</div>
                  <div className="text-[10px] uppercase tracking-wider text-red-300/80">
                    {ticketNumber !== null ? `#GATE-${String(ticketNumber).padStart(6, "0")} · ${status}` : status}
                  </div>
                </div>
              </div>
              <button onClick={() => setChatOpen(false)} className="text-white/60 hover:text-white"><X className="size-5" /></button>
            </header>

            <div className="border-b border-white/10 px-4 py-3">
              <GateStaffPresence />
            </div>

            <div ref={scrollerRef} className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 space-y-3">
              <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-3 text-xs text-red-100/90">
                Introduce yourself and explain why you'd like to join. A moderator will review and grant access from this conversation.
              </div>
              {msgs.map((m) => {
                const mine = m.sender_id === user?.id;
                return (
                  <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[80%] px-3 py-2 rounded-2xl text-sm ${
                      mine ? "bg-red-600 text-white rounded-br-sm" : "bg-white/5 text-white/90 rounded-bl-sm border border-white/10"
                    }`}>
                      {!mine && <div className="text-[10px] text-red-300 font-medium mb-0.5">{senderNames[m.sender_id] ?? "Owner"}</div>}
                      <MentionText content={m.content} className="block" />
                      <div className={`text-[10px] mt-0.5 flex items-center gap-1 ${mine ? "justify-end text-white/60" : "text-white/40"}`}>
                        <span>{new Date(m.created_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</span>
                        {mine && m.status === "sending" && <Loader2 className="size-3 animate-spin" aria-label="Sending" />}
                        {mine && m.status === "sent" && <CheckCheck className="size-3" aria-label="Sent" />}
                        {mine && !m.status && <Check className="size-3" aria-label="Sent" />}
                        {mine && m.status === "failed" && <AlertCircle className="size-3 text-red-300" aria-label="Failed to send" />}
                      </div>
                    </div>
                  </div>
                );
              })}
              {peerTyping && (
                <div className="flex justify-start">
                  <div className="px-3 py-2 rounded-2xl bg-white/5 border border-white/10 text-[11px] text-white/60 inline-flex items-center gap-1.5">
                    <span className="inline-flex gap-0.5">
                      <span className="size-1.5 rounded-full bg-white/60 animate-bounce" style={{ animationDelay: "0ms" }} />
                      <span className="size-1.5 rounded-full bg-white/60 animate-bounce" style={{ animationDelay: "150ms" }} />
                      <span className="size-1.5 rounded-full bg-white/60 animate-bounce" style={{ animationDelay: "300ms" }} />
                    </span>
                    Owner is typing…
                  </div>
                </div>
              )}
            </div>

            {status === "pending" ? (
              <form onSubmit={send} className="p-3 border-t border-white/10">
                <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-3">
                  <input
                    value={text}
                    onChange={(e) => { setText(e.target.value); if (e.target.value) notifyTyping(); }}
                    placeholder="Message support…"
                    className="flex-1 h-11 bg-transparent outline-none text-sm text-white placeholder:text-white/40"
                    autoFocus
                  />
                  <button className="text-red-400 hover:text-red-300 disabled:opacity-30" disabled={!text.trim()}>
                    <Send className="size-4" />
                  </button>
                </div>
              </form>
            ) : (
              <div className="p-4 text-center text-sm text-white/60 border-t border-white/10">
                {status === "approved" ? "Approved — refreshing access." : "This conversation is closed."}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
