import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Star, Send, Loader2, Quote, MessageSquareHeart } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { z } from "zod";
import reviewsHero from "@/assets/reviews-hero.png";
import reviewsBanner from "@/assets/reviews-banner.png";

export const Route = createFileRoute("/_authenticated/_approved/reviews")({
  component: ReviewsPage,
});

type Review = {
  id: string;
  user_id: string;
  rating: number;
  title: string;
  body: string;
  status: "pending" | "approved" | "rejected";
  created_at: string;
};

type Profile = { id: string; display_name: string | null; username: string | null; avatar_url: string | null };

const reviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  title: z.string().trim().min(3, "Title must be at least 3 characters").max(120),
  body: z.string().trim().min(10, "Tell us a bit more (10+ chars)").max(1000),
});

function ReviewsPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState("welcome");
  const [reviews, setReviews] = useState<Review[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [mine, setMine] = useState<Review | null>(null);
  const [rating, setRating] = useState(5);
  const [hover, setHover] = useState(0);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const { data } = await supabase
      .from("customer_reviews")
      .select("id, user_id, rating, title, body, status, created_at")
      .order("created_at", { ascending: false });
    const list = (data ?? []) as Review[];
    setReviews(list);
    const ids = Array.from(new Set(list.map((r) => r.user_id)));
    if (ids.length) {
      const { data: ps } = await supabase
        .from("profiles")
        .select("id, display_name, username, avatar_url")
        .in("id", ids);
      const map: Record<string, Profile> = {};
      (ps ?? []).forEach((p) => (map[(p as Profile).id] = p as Profile));
      setProfiles(map);
    }
    if (user) {
      const own = list.find((r) => r.user_id === user.id) ?? null;
      setMine(own);
      if (own) {
        setRating(own.rating);
        setTitle(own.title);
        setBody(own.body);
      }
    }
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel("customer-reviews-feed")
      .on("postgres_changes", { event: "*", schema: "public", table: "customer_reviews" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const approved = useMemo(() => reviews.filter((r) => r.status === "approved"), [reviews]);
  const avg = useMemo(() => approved.length ? approved.reduce((s, r) => s + r.rating, 0) / approved.length : 0, [approved]);

  const submit = async () => {
    if (!user) return;
    if (mine) return toast.error("You've already left a review");
    const parsed = reviewSchema.safeParse({ rating, title, body });
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    setBusy(true);
    try {
      const { error } = await supabase.from("customer_reviews").insert({
        user_id: user.id,
        rating: parsed.data.rating,
        title: parsed.data.title,
        body: parsed.data.body,
      });
      if (error) {
        if (error.code === "23505") throw new Error("You've already left a review");
        throw error;
      }
      toast.success("Thanks! Your review is awaiting approval.");
      setTab("wall");
      load();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to submit");
    } finally { setBusy(false); }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-gradient-to-br from-[#1a0b2e] via-[#2d1b4e] to-[#1a0b2e]">
      <header className="px-8 pt-8 pb-6 border-b border-purple-500/30 bg-purple-950/40 backdrop-blur">
        <h1 className="font-display text-3xl font-bold bg-gradient-to-r from-violet-600 via-fuchsia-600 to-blue-600 bg-clip-text text-transparent">Customer Reviews</h1>
        <p className="text-purple-200/80 mt-1">Tell us what you think — your feedback helps us grow.</p>
      </header>

      <div className="px-8 py-6">
        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <TabsList className="grid grid-cols-3 max-w-2xl bg-purple-950/60 border border-purple-500/30">
            <TabsTrigger value="welcome" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-fuchsia-600 data-[state=active]:to-purple-600 data-[state=active]:text-white">Welcome</TabsTrigger>
            <TabsTrigger value="wall" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-fuchsia-600 data-[state=active]:to-purple-600 data-[state=active]:text-white">Reviews</TabsTrigger>
            <TabsTrigger value="leave" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-fuchsia-600 data-[state=active]:to-purple-600 data-[state=active]:text-white">Leave a review</TabsTrigger>
          </TabsList>

          <TabsContent value="welcome" className="mt-6">
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-fuchsia-600/30 via-purple-600/30 to-violet-700/30 border border-purple-500/40 shadow-[0_0_60px_-15px_rgba(168,85,247,0.5)]">
              <img
                src={reviewsBanner}
                alt=""
                aria-hidden
                className="absolute inset-0 w-full h-full object-cover opacity-30 mix-blend-luminosity pointer-events-none"
              />
              <div className="absolute inset-0 bg-gradient-to-br from-[#1a0b2e]/70 via-purple-900/50 to-fuchsia-900/40 pointer-events-none" />
              <div className="relative z-10 p-10 md:max-w-[60%]">
                <div className="size-14 rounded-2xl bg-purple-900/60 grid place-items-center mb-4">
                  <MessageSquareHeart className="size-7 text-fuchsia-300" />
                </div>
                <h2 className="font-display text-3xl font-bold bg-gradient-to-r from-violet-600 to-blue-600 bg-clip-text text-transparent">Welcome to our review wall</h2>
                <p className="mt-3 text-lg text-purple-100/90">
                  Share your experience and read what fellow members are saying. Every review is approved by our team before it goes live.
                </p>
                <p className="mt-4 text-purple-200/70">
                  You can leave one review per account — make it count!
                </p>
                <div className="mt-6 flex flex-wrap gap-3">
                  <Button onClick={() => setTab("wall")} className="bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 text-white border-0 shadow-lg shadow-purple-900/50">Read reviews</Button>
                  <Button onClick={() => setTab("leave")} variant="outline" className="border-purple-400/60 bg-purple-900/30 text-purple-100 hover:bg-purple-800/60 hover:text-white">Leave yours</Button>
                </div>
                {approved.length > 0 && (
                  <div className="mt-8 inline-flex items-center gap-3 rounded-xl bg-purple-950/60 border border-purple-500/40 px-4 py-3">
                    <RatingStars value={Math.round(avg)} />
                    <div className="text-purple-100"><span className="font-bold">{avg.toFixed(1)}</span> from {approved.length} review{approved.length === 1 ? "" : "s"}</div>
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="wall" className="mt-6">
            {approved.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-purple-500/40 p-12 text-center text-purple-200/70 bg-purple-950/30">
                No approved reviews yet. Be the first!
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                {approved.map((r) => {
                  const p = profiles[r.user_id];
                  const name = p?.display_name || p?.username || "Member";
                  return (
                    <article key={r.id} className="relative rounded-2xl bg-gradient-to-br from-purple-950/70 to-fuchsia-950/40 border border-purple-500/30 p-5 hover:border-fuchsia-500/60 hover:shadow-[0_0_30px_-10px_rgba(217,70,239,0.6)] transition-all">
                      <Quote className="absolute top-4 right-4 size-8 text-fuchsia-500/20" />
                      <RatingStars value={r.rating} />
                      <h3 className="mt-3 font-display font-semibold text-lg text-purple-50">{r.title}</h3>
                      <p className="mt-2 text-sm text-purple-100/80 whitespace-pre-wrap">{r.body}</p>
                      <div className="mt-4 pt-4 border-t border-purple-500/20 flex items-center gap-3">
                        {p?.avatar_url ? (
                          <img src={p.avatar_url} alt={name} className="size-9 rounded-full object-cover ring-2 ring-fuchsia-500/40" />
                        ) : (
                          <div className="size-9 rounded-full bg-gradient-to-br from-violet-600 to-blue-600 grid place-items-center text-white text-xs font-bold">
                            {name.slice(0, 1).toUpperCase()}
                          </div>
                        )}
                        <div className="text-xs">
                          <div className="font-semibold text-purple-100">{name}</div>
                          <div className="text-purple-300/60">{new Date(r.created_at).toLocaleDateString()}</div>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="leave" className="mt-6">
            <div className="relative max-w-2xl overflow-hidden rounded-2xl bg-purple-950/50 border border-purple-500/30 p-6 backdrop-blur">
              <img
                src={reviewsBanner}
                alt=""
                aria-hidden
                className="absolute inset-0 w-full h-full object-cover opacity-25 mix-blend-luminosity pointer-events-none"
              />
              <div className="absolute inset-0 bg-gradient-to-br from-[#1a0b2e]/80 via-purple-900/60 to-fuchsia-900/40 pointer-events-none" />
              <div className="relative z-10">
              {mine ? (
                <div>
                  <h2 className="font-display text-xl font-bold text-purple-50">Your review</h2>
                  <p className="text-sm text-purple-200/70 mt-1">
                    Status:{" "}
                    <span className={
                      mine.status === "approved" ? "text-emerald-300" :
                      mine.status === "rejected" ? "text-rose-300" : "text-amber-300"
                    }>{mine.status}</span>
                    {" "}— you can only leave one review per account.
                  </p>
                  <div className="mt-4 rounded-xl bg-purple-900/40 border border-purple-500/30 p-4">
                    <RatingStars value={mine.rating} />
                    <h3 className="mt-2 font-semibold text-purple-50">{mine.title}</h3>
                    <p className="mt-1 text-sm text-purple-100/80 whitespace-pre-wrap">{mine.body}</p>
                  </div>
                </div>
              ) : (
                <>
                  <h2 className="font-display text-xl font-bold text-purple-50">Leave a review</h2>
                  <p className="text-sm text-purple-200/70 mt-1">A team member will approve it before it appears on the wall.</p>

                  <div className="mt-5 space-y-4">
                    <div>
                      <label className="text-xs uppercase tracking-wider text-purple-300/80">Your rating</label>
                      <div className="mt-2 flex items-center gap-1">
                        {[1, 2, 3, 4, 5].map((n) => (
                          <button
                            key={n}
                            type="button"
                            onMouseEnter={() => setHover(n)}
                            onMouseLeave={() => setHover(0)}
                            onClick={() => setRating(n)}
                            className="p-1"
                            aria-label={`Rate ${n} stars`}
                          >
                            <Star
                              className={`size-7 transition-all ${
                                (hover || rating) >= n
                                  ? "fill-fuchsia-400 text-fuchsia-400 drop-shadow-[0_0_8px_rgba(217,70,239,0.6)]"
                                  : "text-purple-700"
                              }`}
                            />
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="text-xs uppercase tracking-wider text-purple-300/80">Title</label>
                      <Input
                        maxLength={120}
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="Sum it up in a few words"
                        className="mt-1 bg-purple-950/60 border-purple-500/30 text-purple-50 placeholder:text-purple-300/50 focus-visible:ring-fuchsia-500"
                      />
                    </div>
                    <div>
                      <label className="text-xs uppercase tracking-wider text-purple-300/80">Your review</label>
                      <Textarea
                        maxLength={1000}
                        value={body}
                        onChange={(e) => setBody(e.target.value)}
                        placeholder="What did you love? What could we improve?"
                        rows={5}
                        className="mt-1 bg-purple-950/60 border-purple-500/30 text-purple-50 placeholder:text-purple-300/50 focus-visible:ring-fuchsia-500"
                      />
                      <div className="mt-1 text-xs text-purple-300/60 text-right">{body.length}/1000</div>
                    </div>
                    <Button
                      disabled={busy}
                      onClick={submit}
                      className="bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 text-white border-0 shadow-lg shadow-purple-900/50"
                    >
                      {busy ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Send className="size-4 mr-2" />}
                      Submit review
                    </Button>
                  </div>
                </>
              )}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function RatingStars({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={`size-4 ${n <= value ? "fill-fuchsia-400 text-fuchsia-400" : "text-purple-700"}`}
        />
      ))}
    </div>
  );
}