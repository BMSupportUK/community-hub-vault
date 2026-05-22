import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Headphones, MessageSquare, Activity, Ticket, ShoppingBag, BookOpen, UserPlus, ArrowUp, ArrowDown, Pencil, Upload, Sparkles, Image as ImageIcon } from "lucide-react";
import heroImg from "@/assets/member-hero.jpg";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { generateEventBanner } from "@/lib/event-banner.functions";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import Cropper, { type Area } from "react-easy-crop";

export const Route = createFileRoute("/_authenticated/_approved/home/")({
  component: WelcomePage,
});

function WelcomePage() {
  const { user, hasRole } = useAuth();
  const canManage = hasRole("admin") || hasRole("management");
  const canEditEvent = hasRole("admin") || hasRole("management") || hasRole("staff");
  const name = (user?.email ?? "there").split("@")[0];
  const navigate = useNavigate();

  const [event, setEvent] = useState<{ id: string; body: string; banner_url: string | null } | null>(null);
  const [eventOpen, setEventOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editBody, setEditBody] = useState("");
  const [savingEvent, setSavingEvent] = useState(false);
  const [bannerOpen, setBannerOpen] = useState(false);
  const [bannerPrompt, setBannerPrompt] = useState("");
  const [bannerBusy, setBannerBusy] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  const [crop, setCrop] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const callGenerateBanner = useServerFn(generateEventBanner);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("upcoming_event")
        .select("id, body, banner_url")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) setEvent(data as { id: string; body: string; banner_url: string | null });
    })();
  }, []);

  const openEdit = () => {
    setEditBody(event?.body ?? "");
    setEditOpen(true);
  };

  const saveEvent = async () => {
    if (!event) return;
    setSavingEvent(true);
    const { error } = await supabase
      .from("upcoming_event")
      .update({ body: editBody, updated_by: user?.id ?? null })
      .eq("id", event.id);
    setSavingEvent(false);
    if (error) { toast.error(error.message); return; }
    setEvent({ ...event, body: editBody });
    setEditOpen(false);
    toast.success("Event updated");
  };

  const pickFile = (file: File) => {
    if (!file.type.startsWith("image/")) { toast.error("Please pick an image"); return; }
    if (pendingUrl) URL.revokeObjectURL(pendingUrl);
    setPendingFile(file);
    setPendingUrl(URL.createObjectURL(file));
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
  };

  const cancelCrop = () => {
    if (pendingUrl) URL.revokeObjectURL(pendingUrl);
    setPendingFile(null);
    setPendingUrl(null);
    setCroppedAreaPixels(null);
  };

  const confirmCrop = async () => {
    if (!event || !user || !pendingUrl || !croppedAreaPixels) return;
    setBannerBusy(true);
    try {
      const blob = await renderCrop(pendingUrl, croppedAreaPixels, 300, 250);
      if (!blob) throw new Error("Could not process image");
      const path = `${event.id}/${Date.now()}.jpg`;
      const { error: upErr } = await supabase.storage.from("event-banners").upload(path, blob, { upsert: true, contentType: "image/jpeg" });
      if (upErr) throw new Error(upErr.message);
      const { data: pub } = supabase.storage.from("event-banners").getPublicUrl(path);
      const url = pub.publicUrl;
      const { error } = await supabase.from("upcoming_event").update({ banner_url: url, updated_by: user.id }).eq("id", event.id);
      if (error) throw new Error(error.message);
      setEvent({ ...event, banner_url: url });
      cancelCrop();
      setBannerOpen(false);
      toast.success("Banner updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBannerBusy(false);
    }
  };

  const aiGenerateBanner = async () => {
    if (!event || !bannerPrompt.trim()) return;
    setBannerBusy(true);
    try {
      const res = await callGenerateBanner({ data: { prompt: bannerPrompt.trim(), eventId: event.id } });
      setEvent({ ...event, banner_url: res.url });
      toast.success("Banner generated");
      setBannerOpen(false);
      setBannerPrompt("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to generate");
    } finally {
      setBannerBusy(false);
    }
  };

  const clearBanner = async () => {
    if (!event) return;
    const { error } = await supabase.from("upcoming_event").update({ banner_url: null }).eq("id", event.id);
    if (error) { toast.error(error.message); return; }
    setEvent({ ...event, banner_url: null });
    toast.success("Banner removed");
  };

  const goToInvite = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("profiles")
      .select("username")
      .eq("id", user.id)
      .maybeSingle();
    if (error || !data?.username) {
      toast.error("Set up your profile username first");
      return;
    }
    navigate({ to: "/u/$username", params: { username: data.username }, search: { tab: "referrals" } });
  };

  type CardDef = {
    key: string;
    icon: React.ComponentType<{ className?: string }>;
    title: string;
    desc: string;
    to?: string;
    params?: Record<string, string>;
    onClick?: () => void;
  };

  const CARDS: Record<string, CardDef> = {
    community: { key: "community", icon: MessageSquare, title: "Community channels", desc: "Chat with members and staff in real time.", to: "/home/$channel", params: { channel: "welcome" } },
    tickets: { key: "tickets", icon: Ticket, title: "Support tickets", desc: "Open or follow your support requests.", to: "/tickets" },
    status: { key: "status", icon: Activity, title: "System status", desc: "Live infrastructure and incident updates.", to: "/status" },
    shop: { key: "shop", icon: ShoppingBag, title: "Shop", desc: "Browse plans, add-ons and gear.", to: "/shop" },
    "install-guides": { key: "install-guides", icon: BookOpen, title: "Install guides", desc: "Step-by-step setup walkthroughs.", to: "/install-guides" },
    invite: { key: "invite", icon: UserPlus, title: "Create an invite", desc: "Invite a friend and earn a referral bonus.", onClick: goToInvite },
  };

  const [order, setOrder] = useState<string[]>(Object.keys(CARDS));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("home_quick_link_order")
        .select("key, sort_order")
        .order("sort_order", { ascending: true });
      if (cancelled) return;
      const known = Object.keys(CARDS);
      const fromDb = (data ?? []).map((r) => r.key).filter((k) => known.includes(k));
      const missing = known.filter((k) => !fromDb.includes(k));
      setOrder([...fromDb, ...missing]);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const persistOrder = async (next: string[]) => {
    setSaving(true);
    const rows = next.map((key, i) => ({ key, sort_order: (i + 1) * 10, updated_by: user?.id ?? null, updated_at: new Date().toISOString() }));
    const { error } = await supabase.from("home_quick_link_order").upsert(rows, { onConflict: "key" });
    setSaving(false);
    if (error) {
      toast.error("Couldn't save order");
    } else {
      toast.success("Order saved");
    }
  };

  const move = (key: string, dir: -1 | 1) => {
    setOrder((prev) => {
      const idx = prev.indexOf(key);
      const target = idx + dir;
      if (idx < 0 || target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[target]] = [next[target], next[idx]];
      void persistOrder(next);
      return next;
    });
  };

  return (
    <main className="flex-1 overflow-y-auto">
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border">
        <div className="absolute inset-0 bg-gradient-to-br from-violet-600 via-fuchsia-600 to-blue-600" />
        <div className="relative grid md:grid-cols-[1fr_1.4fr] gap-6 p-6 md:p-10">
          <div className="flex flex-col justify-center text-white">
            <div className="text-xs uppercase tracking-[0.2em] text-sky-200/80 mb-3">BM Support · Member Hub</div>
            <h1 className="font-display text-3xl md:text-5xl font-bold leading-tight">
              Welcome to BM Support
            </h1>
            <p className="mt-4 text-white/95 max-w-lg">
              Hey {name} — your all-in-one server for BM Support. Stay connected with the
              community, manage your account and get help, all in one place.
            </p>
            <p className="mt-3 text-white/85 max-w-lg text-sm">
              Access community channels, view schedules, get support and explore our
              services. Everything you need is just one click away.
            </p>

            {!hasRole("moderator") && (
              <Link
                to="/tickets"
                className="mt-6 inline-flex items-center gap-3 self-start rounded-xl border-2 border-white/40 bg-white/10 backdrop-blur px-4 py-3 text-sm font-medium text-white shadow-[0_0_24px_rgba(255,255,255,0.15)] hover:bg-white/20 hover:border-white/60 transition"
              >
                <span className="grid place-items-center size-9 rounded-lg bg-gradient-to-br from-violet-600 to-blue-600">
                  <Headphones className="size-4 text-white" />
                </span>
                <span>
                  <span className="block text-white">Expert Support</span>
                  <span className="block text-[11px] text-sky-50/90">We're always here to help.</span>
                </span>
                <span className="ml-2 size-2 rounded-full bg-emerald-400 shadow-[0_0_12px] shadow-emerald-400/60" />
              </Link>
            )}
          </div>

          <div className="flex flex-col xl:flex-row gap-4 items-stretch">
            <div className="relative rounded-2xl overflow-hidden ring-1 ring-white/10 shadow-2xl flex-1 min-h-[300px]">
              <img
                src={heroImg}
                alt="BM Support — community and support"
                width={1280}
                height={832}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-tr from-blue-950/40 via-transparent to-transparent" />
            </div>

            {/* Event adverts beside hero image */}
            <div className="flex flex-row xl:flex-col gap-4 justify-center xl:justify-start flex-wrap">
              {/* Event banner 300x250 advert */}
              <div
                className="relative rounded-2xl border-2 border-violet-500/60 bg-surface shadow-[0_0_30px_rgba(139,92,246,0.25)] overflow-hidden"
                style={{ width: 300, height: 250 }}
              >
                {canEditEvent && (
                  <button
                    onClick={() => setBannerOpen(true)}
                    className="absolute top-2 right-2 z-10 size-7 grid place-items-center rounded-md bg-background/80 border border-violet-500/40 text-foreground/80 hover:bg-violet-500/20 transition"
                    aria-label="Edit banner"
                  >
                    <Pencil className="size-3.5" />
                  </button>
                )}
                {event?.banner_url ? (
                  <img
                    src={event.banner_url}
                    alt="Upcoming event banner"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-3 p-5 text-center bg-gradient-to-br from-violet-600/10 to-blue-600/10">
                    <ImageIcon className="size-10 text-violet-400" />
                    <p className="font-display font-semibold text-base text-foreground">
                      Awaiting The Next Event.
                    </p>
                  </div>
                )}
              </div>

              {/* Upcoming event 300x250 advert */}
              <div
                className="relative rounded-2xl border-2 border-violet-500/60 bg-surface shadow-[0_0_30px_rgba(139,92,246,0.25)] p-5 flex flex-col items-center justify-between gap-3"
                style={{ width: 300, height: 250 }}
              >
                {canEditEvent && (
                  <button
                    onClick={openEdit}
                    className="absolute top-2 right-2 size-7 grid place-items-center rounded-md bg-background/80 border border-violet-500/40 text-foreground/80 hover:bg-violet-500/20 transition"
                    aria-label="Edit event"
                  >
                    <Pencil className="size-3.5" />
                  </button>
                )}
                <h3 className="font-display font-bold text-center text-base leading-tight text-foreground">
                  The Next Big Event on BM Support
                </h3>
                <p className="text-sm text-foreground/75 text-center line-clamp-4">
                  {event?.body || "Stay tuned…"}
                </p>
                <button
                  onClick={() => setEventOpen(true)}
                  className="px-4 py-2 rounded-md bg-gradient-to-br from-violet-600 to-blue-600 hover:opacity-90 text-white text-sm font-medium shadow-[0_0_20px_rgba(139,92,246,0.45)] transition"
                >
                  Read more
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Quick links */}
      <section className="p-6 md:p-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-lg font-semibold">Jump back in</h2>
          <Link to="/home/$channel" params={{ channel: "welcome" }} className="text-sm text-sky-300 hover:text-sky-200">
            Open channels →
          </Link>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          {order.map((key, idx) => {
            if (hasRole("moderator") && key === "tickets") return null;
            const c = CARDS[key];
            if (!c) return null;
            const controls = canManage ? (
              <div className="absolute top-1.5 right-1.5 flex flex-col gap-1 z-10">
                <button
                  type="button"
                  aria-label="Move up"
                  disabled={idx === 0 || saving}
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); move(key, -1); }}
                  className="size-6 grid place-items-center rounded-md bg-background/80 border border-violet-500/40 text-foreground/80 hover:bg-violet-500/20 disabled:opacity-30"
                >
                  <ArrowUp className="size-3.5" />
                </button>
                <button
                  type="button"
                  aria-label="Move down"
                  disabled={idx === order.length - 1 || saving}
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); move(key, 1); }}
                  className="size-6 grid place-items-center rounded-md bg-background/80 border border-violet-500/40 text-foreground/80 hover:bg-violet-500/20 disabled:opacity-30"
                >
                  <ArrowDown className="size-3.5" />
                </button>
              </div>
            ) : null;
            return (
              <div key={key} className="relative h-full">
                {controls}
                {c.to ? (
                  <QuickCard to={c.to} params={c.params} icon={c.icon} title={c.title} desc={c.desc} />
                ) : (
                  <QuickAction onClick={c.onClick!} icon={c.icon} title={c.title} desc={c.desc} />
                )}
              </div>
            );
            })}
        </div>
      </section>

      <Dialog open={eventOpen} onOpenChange={setEventOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>The Next Big Event on BM Support</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-foreground whitespace-pre-wrap">
            {event?.body || "Stay tuned…"}
          </p>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit upcoming event</DialogTitle>
          </DialogHeader>
          <Textarea
            value={editBody}
            onChange={(e) => setEditBody(e.target.value)}
            rows={8}
            placeholder="Tell members about the next big event…"
          />
          <DialogFooter>
            <button
              onClick={() => setEditOpen(false)}
              className="px-4 py-2 rounded-md border border-border text-sm"
            >
              Cancel
            </button>
            <button
              onClick={saveEvent}
              disabled={savingEvent}
              className="px-4 py-2 rounded-md bg-gradient-to-br from-violet-600 to-blue-600 text-white text-sm disabled:opacity-50"
            >
              {savingEvent ? "Saving…" : "Save"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={bannerOpen} onOpenChange={setBannerOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Event banner (300×250)</DialogTitle>
          </DialogHeader>
          {pendingUrl ? (
            <div className="space-y-4">
              <div className="relative w-full bg-black/40 rounded-md overflow-hidden" style={{ height: 280 }}>
                <Cropper
                  image={pendingUrl}
                  crop={crop}
                  zoom={zoom}
                  aspect={300 / 250}
                  onCropChange={setCrop}
                  onZoomChange={setZoom}
                  onCropComplete={(_a, areaPixels) => setCroppedAreaPixels(areaPixels)}
                />
              </div>
              <div>
                <label className="text-xs text-foreground/70 mb-1 block">Zoom</label>
                <Slider value={[zoom]} min={1} max={4} step={0.05} onValueChange={(v) => setZoom(v[0])} />
              </div>
              <DialogFooter>
                <button onClick={cancelCrop} disabled={bannerBusy} className="px-4 py-2 rounded-md border border-border text-sm">Cancel</button>
                <button onClick={confirmCrop} disabled={bannerBusy || !croppedAreaPixels} className="px-4 py-2 rounded-md bg-gradient-to-br from-violet-600 to-blue-600 text-white text-sm disabled:opacity-50">
                  {bannerBusy ? "Uploading…" : "Use this crop"}
                </button>
              </DialogFooter>
            </div>
          ) : (
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 flex items-center gap-2">
                <Upload className="size-4" /> Upload an image
              </label>
              <Input
                type="file"
                accept="image/*"
                disabled={bannerBusy}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) pickFile(f);
                }}
              />
              <p className="text-xs text-foreground/60 mt-1">You'll be able to crop the image to fit 300×250.</p>
            </div>
            <div className="border-t border-border pt-4">
              <label className="text-sm font-medium mb-2 flex items-center gap-2">
                <Sparkles className="size-4" /> Or design with AI
              </label>
              <Textarea
                value={bannerPrompt}
                onChange={(e) => setBannerPrompt(e.target.value)}
                rows={3}
                placeholder="Describe the banner you want (e.g. 'Summer LAN party, neon retro arcade vibe, with date June 15')"
                disabled={bannerBusy}
              />
              <button
                onClick={aiGenerateBanner}
                disabled={bannerBusy || !bannerPrompt.trim()}
                className="mt-2 px-4 py-2 rounded-md bg-gradient-to-br from-violet-600 to-blue-600 text-white text-sm disabled:opacity-50 inline-flex items-center gap-2"
              >
                <Sparkles className="size-4" />
                {bannerBusy ? "Generating…" : "Generate banner"}
              </button>
            </div>
            {event?.banner_url && (
              <div className="border-t border-border pt-4">
                <button
                  onClick={clearBanner}
                  disabled={bannerBusy}
                  className="text-sm text-red-400 hover:text-red-300"
                >
                  Remove current banner
                </button>
              </div>
            )}
          </div>
          )}
        </DialogContent>
      </Dialog>
    </main>
  );
}

function QuickCard({
  to,
  params,
  icon: Icon,
  title,
  desc,
}: {
  to: string;
  params?: Record<string, string>;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  desc: string;
}) {
  return (
    <Link
      to={to as never}
      params={params as never}
      className="group w-full h-full rounded-xl border-2 border-violet-500/40 bg-surface hover:bg-surface-2 hover:border-violet-400/70 hover:shadow-[0_0_20px_rgba(139,92,246,0.25)] transition-all p-4 flex items-start gap-3"
    >
      <span className="grid place-items-center size-10 rounded-lg bg-gradient-to-br from-violet-600 to-blue-600 text-white shrink-0">
        <Icon className="size-5" />
      </span>
      <span className="min-w-0">
        <span className="block font-semibold text-sm text-foreground">{title}</span>
        <span className="block text-xs text-foreground/75 mt-0.5">{desc}</span>
      </span>
    </Link>
  );
}

function QuickAction({
  onClick,
  icon: Icon,
  title,
  desc,
}: {
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  desc: string;
}) {
  return (
    <button
      onClick={onClick}
      className="group w-full h-full text-left rounded-xl border-2 border-violet-500/40 bg-surface hover:bg-surface-2 hover:border-violet-400/70 hover:shadow-[0_0_20px_rgba(139,92,246,0.25)] transition-all p-4 flex items-start gap-3"
    >
      <span className="grid place-items-center size-10 rounded-lg bg-gradient-to-br from-violet-600 to-blue-600 text-white shrink-0">
        <Icon className="size-5" />
      </span>
      <span className="min-w-0">
        <span className="block font-semibold text-sm text-foreground">{title}</span>
        <span className="block text-xs text-foreground/75 mt-0.5">{desc}</span>
      </span>
    </button>
  );
}

async function renderCrop(src: string, area: Area, outW: number, outH: number): Promise<Blob | null> {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = src;
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, outW, outH);
  ctx.drawImage(img, area.x, area.y, area.width, area.height, 0, 0, outW, outH);
  return await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/jpeg", 0.9)
  );
}