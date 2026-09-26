import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useEffect } from "react";
import { LandingHeader } from "@/components/LandingHeader";
import { BmSplash } from "@/components/app/BmSplash";
import { getPublicGuide, type PublicGuideDetail } from "@/lib/public-guides.functions";
import { Clock, CalendarDays, ArrowLeft } from "lucide-react";
import sportsBgAsset from "@/assets/sports-bg.jpg.asset.json";
const sportsBg = sportsBgAsset.url;

export const Route = createFileRoute("/guides/$id")({
  loader: async ({ params }) => {
    const guide = await getPublicGuide({ data: params.id });
    if (!guide) throw notFound();
    return guide;
  },
  head: ({ loaderData, params }) => {
    const title = loaderData
      ? `${loaderData.title} | Sports Guide | BM Support`
      : "Sports Guide | BM Support";
    const description =
      loaderData?.excerpt ??
      "Fixture dates and start times from BM Support. Members see full channel listings inside the app.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "article" },
        { property: "og:url", content: `https://bmsupport.uk/guides/${params.id}` },
        { rel: "canonical", href: `https://bmsupport.uk/guides/${params.id}` },
      ],
    };
  },
  notFoundComponent: GuideNotFound,
  pendingComponent: () => <BmSplash label="Loading guide…" />,
  pendingMs: 0,
  component: PublicGuidePage,
});

function GuideNotFound() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <LandingHeader />
      <main className="mx-auto w-full max-w-3xl px-4 py-16 text-center">
        <h1 className="text-2xl font-bold">Guide not found</h1>
        <p className="mt-3 text-muted-foreground">
          This guide may have been removed or hasn't been published yet.
        </p>
        <Link to="/guides" className="mt-6 inline-block text-fuchsia-300 underline underline-offset-4">
          Back to all sports guides
        </Link>
      </main>
    </div>
  );
}

function PublicGuidePage() {
  const guide = Route.useLoaderData() as PublicGuideDetail;

  useEffect(() => {
    try {
      const key = "bm-public-sports-guide-reads";
      const stored = JSON.parse(localStorage.getItem(key) ?? "{}");
      const reads = stored && typeof stored === "object" ? stored as Record<string, string> : {};
      reads[guide.id] = new Date().toISOString();
      localStorage.setItem(key, JSON.stringify(reads));
      window.dispatchEvent(new Event("bm-public-guide-read"));
    } catch {
      /* Reading a public guide must still work when storage is unavailable. */
    }
  }, [guide.id]);

  return (
    <div
      className="flex min-h-screen flex-col bg-background/90 bg-cover bg-center bg-blend-multiply text-foreground"
      style={{ backgroundImage: `url(${sportsBg})` }}
    >
      <LandingHeader />
      <div className="relative flex-1">
        <main className="mx-auto w-full max-w-screen-2xl px-4 py-10 sm:px-8">
          <Link
            to="/guides"
            className="inline-flex items-center gap-1.5 text-sm text-purple-200/80 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" /> All sports guides
          </Link>

          <p className="mt-6 text-xs font-semibold uppercase tracking-widest text-fuchsia-300">
            {guide.category}
          </p>
          <h1 className="mt-2 font-display text-3xl font-bold sm:text-4xl bg-gradient-to-r from-violet-600 via-fuchsia-600 to-blue-600 bg-clip-text text-transparent">
            {guide.title}
          </h1>
          {guide.excerpt && (
            <p className="mt-3 text-purple-200/80">{guide.excerpt}</p>
          )}
          <p className="mt-2 flex items-center gap-1.5 text-xs text-purple-300/70">
            <CalendarDays className="h-3.5 w-3.5" />
            Last updated{" "}
            {new Date(guide.updated_at ?? guide.created_at).toLocaleString("en-GB", {
              day: "numeric",
              month: "long",
              year: "numeric",
              hour: "numeric",
              minute: "2-digit",
              hour12: true,
            })}
          </p>

          {guide.notes.length > 0 && (
            <div className="mt-8 space-y-2">
              {guide.notes.map((note, i) => (
                <p key={i} className="text-sm text-purple-200/70">
                  {note}
                </p>
              ))}
            </div>
          )}

          <ul className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {guide.events.map((e, i) => (
              <li
                key={i}
                className="rounded-xl border border-purple-500/30 bg-purple-950/50 p-4 backdrop-blur"
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  {e.date && (
                    <span className="font-semibold text-fuchsia-200">{e.date}</span>
                  )}
                  {e.time && (
                    <span className="inline-flex items-center gap-1 font-semibold text-purple-50">
                      <Clock className="h-3.5 w-3.5" />
                      {e.time}
                    </span>
                  )}
                </div>
                <p className="mt-1.5 font-medium text-purple-50">{e.title}</p>
              </li>
            ))}
          </ul>

        </main>
      </div>
    </div>
  );
}
