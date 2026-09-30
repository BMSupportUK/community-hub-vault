import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, BookOpen, FileText, Film, Loader2, Play, Search, ShieldCheck } from "lucide-react";
import { getCheckoutInstallGuides, openCheckoutGuideVideo, openCheckoutInstallGuide } from "@/lib/checkout-guides.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MobilePdfViewer } from "@/components/app/MobilePdfViewer";
import installHero from "@/assets/install-guides-bg.jpg";

type Guide = { id: string; category_id: string; title: string; excerpt: string | null; body: string | null; image_url: string | null; pdf_url: string | null; video_url: string | null; file_path: string | null };
type OpenGuide = { title: string; body: string | null; url: string | null };

export const Route = createFileRoute("/checkout-install/$token")({
  head: () => ({ meta: [
    { title: "Install guides for your order — BM Support" },
    { name: "description", content: "Private BM Support installation guides for a paid order." },
    { name: "robots", content: "noindex, nofollow" },
    { property: "og:title", content: "Install guides for your order — BM Support" },
    { property: "og:description", content: "Private BM Support installation guides for a paid order." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: CheckoutInstallGuidesPage,
});

function CheckoutInstallGuidesPage() {
  const { token } = Route.useParams();
  const fetchGuides = useServerFn(getCheckoutInstallGuides);
  const openGuide = useServerFn(openCheckoutInstallGuide);
  const openVideo = useServerFn(openCheckoutGuideVideo);
  const [password, setPassword] = useState<string | null>(null);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [guides, setGuides] = useState<Guide[]>([]);
  const [orderRef, setOrderRef] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);
  const [opened, setOpened] = useState<OpenGuide | null>(null);
  const [video, setVideo] = useState<{ title: string; url: string } | null>(null);

  useEffect(() => {
    // Member (shop) orders unlock with the link alone, so no password is saved;
    // manual orders need the saved password. Trying "" fails safely for manual.
    const saved = sessionStorage.getItem(`bm-pay-${token}`) ?? "";
    setPassword(saved);
    fetchGuides({ data: { token, password: saved } }).then((result) => {
      if (!result.ok) { setDenied(true); return; }
      setCategories(result.categories); setGuides(result.guides as Guide[]); setOrderRef(result.orderRef); setActiveCategory(result.categories[0]?.id ?? null);
    }).catch(() => setDenied(true)).finally(() => setLoading(false));
  }, [fetchGuides, token]);

  const shown = useMemo(() => guides.filter((guide) => {
    const needle = search.trim().toLowerCase();
    return (!activeCategory || guide.category_id === activeCategory) && (!needle || `${guide.title} ${guide.excerpt ?? ""}`.toLowerCase().includes(needle));
  }), [activeCategory, guides, search]);

  const readGuide = async (guide: Guide) => {
    if (password === null) return;
    setOpening(guide.id);
    try {
      if (guide.video_url) {
        const result = await openVideo({ data: { token, password, blogId: guide.id } });
        if (result.ok && result.url) setVideo({ title: guide.title, url: result.url });
      } else {
        const result = await openGuide({ data: { token, password, blogId: guide.id } });
        if (result.ok) setOpened({ title: result.title, body: result.body, url: result.url });
      }
    } finally { setOpening(null); }
  };

  if (loading) return <main className="min-h-screen grid place-items-center bg-background"><Loader2 className="size-8 animate-spin text-primary" /></main>;
  if (denied) return <main className="min-h-screen grid place-items-center bg-background px-5"><section className="max-w-md rounded-lg border border-border bg-card p-6 text-center space-y-4"><ShieldCheck className="mx-auto size-10 text-primary" /><h1 className="font-display text-2xl font-bold">Open your paid order first</h1><p className="text-sm text-muted-foreground">These guides are private. Enter the password on your secure order page, then use its Install guides button.</p><Button asChild className="w-full"><Link to="/pay/$token" params={{ token }}><ArrowLeft /> Return to my order</Link></Button></section></main>;

  return <main className="min-h-screen bg-background text-foreground pb-16">
    <div className="relative min-h-64 overflow-hidden border-b border-border"><img src={installHero} alt="Couple watching an install guide on television" className="absolute inset-0 size-full object-cover" /><div className="absolute inset-0 bg-background/75" /><div className="relative p-5 sm:p-10 space-y-4"><Button asChild variant="outline"><Link to="/pay/$token" params={{ token }}><ArrowLeft /> Back to order #{orderRef}</Link></Button><div className="max-w-2xl"><h1 className="font-display text-3xl sm:text-4xl font-bold">Install guides</h1><p className="mt-2 text-muted-foreground">Everything you need to install the app before your account setup is complete.</p></div></div></div>
    <div className="w-full px-3 sm:px-6 py-6 grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]"><aside className="space-y-2 lg:sticky lg:top-4 lg:self-start"><h2 className="font-semibold px-2">Categories</h2>{categories.map((category) => <Button key={category.id} variant={activeCategory === category.id ? "default" : "ghost"} className="w-full justify-start" onClick={() => setActiveCategory(category.id)}>{category.name}</Button>)}</aside><section className="min-w-0 space-y-5"><div className="relative max-w-xl"><Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search install guides" className="pl-9" /></div>{shown.length ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{shown.map((guide) => <article key={guide.id} className="overflow-hidden rounded-lg border border-border bg-card flex flex-col"><div className="aspect-[16/10] bg-muted grid place-items-center overflow-hidden">{guide.image_url ? <img src={guide.image_url} alt="" className="size-full object-contain" /> : guide.video_url ? <Film className="size-10 text-muted-foreground" /> : <FileText className="size-10 text-muted-foreground" />}</div><div className="p-4 flex flex-1 flex-col gap-3"><div><h2 className="font-semibold text-lg">{guide.title}</h2>{guide.excerpt && <p className="mt-1 text-sm text-muted-foreground line-clamp-3">{guide.excerpt}</p>}</div><Button className="mt-auto w-full" onClick={() => void readGuide(guide)} disabled={opening === guide.id}>{opening === guide.id ? <Loader2 className="animate-spin" /> : guide.video_url ? <Play /> : <BookOpen />}{guide.video_url ? "Watch guide" : "Open guide"}</Button></div></article>)}</div> : <div className="rounded-lg border border-dashed border-border p-10 text-center text-muted-foreground">No guides found.</div>}</section></div>
    <Dialog open={!!opened} onOpenChange={(open) => { if (!open) setOpened(null); }}><DialogContent className={opened?.url ? "flex h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-5xl flex-col overflow-hidden p-3 sm:h-[90vh] sm:p-6" : "max-w-2xl max-h-[85vh] overflow-y-auto"}>{opened && <><DialogHeader><DialogTitle>{opened.title}</DialogTitle></DialogHeader>{opened.url ? <><div className="min-h-0 flex-1 md:hidden"><MobilePdfViewer url={opened.url} title={opened.title} /></div><iframe src={`${opened.url}#toolbar=0&navpanes=0`} title={opened.title} className="hidden min-h-0 flex-1 w-full rounded-lg border border-border bg-card md:block" /></> : <div className="whitespace-pre-wrap text-sm leading-relaxed">{opened.body || "This guide has no readable content yet."}</div>}</>}</DialogContent></Dialog>
    <Dialog open={!!video} onOpenChange={(open) => { if (!open) setVideo(null); }}><DialogContent className="max-w-6xl p-3 sm:p-5">{video && <><DialogHeader><DialogTitle>{video.title}</DialogTitle></DialogHeader><video src={video.url} controls controlsList="nodownload" disablePictureInPicture className="max-h-[80dvh] w-full bg-card" /></>}</DialogContent></Dialog>
  </main>;
}