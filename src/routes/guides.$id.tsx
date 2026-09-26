import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { LandingHeader } from "@/components/LandingHeader";
import { getPublicGuide, type PublicGuideDetail } from "@/lib/public-guides.functions";
import { Clock, CalendarDays, Lock, ArrowLeft } from "lucide-react";
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

  return (
    <div className="min-h-screen bg-background text-foreground">
      <LandingHeader />
      <div
        className="relative bg-background/90 bg-cover bg-center bg-fixed bg-blend-multiply"
        style={{ backgroundImage: `url(${sportsBg})` }}
      >
        <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-8">
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
            Published{" "}
            {new Date(guide.created_at).toLocaleDateString("en-GB", {
              day: "numeric",
              month: "long",
              year: "numeric",
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

          <ul className="mt-8 space-y-3">
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

          <div className="mt-10 rounded-2xl border border-fuchsia-400/30 bg-purple-950/50 p-6 text-center backdrop-blur">
            <Lock className="mx-auto h-6 w-6 text-fuchsia-300" />
            <h2 className="mt-3 text-lg font-semibold text-purple-50">
              Want to know which channels are showing these?
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-purple-200/70">
              BM Support members get the full guide inside the app — every event
              with its exact channel listings, plus live chat, support tickets
              and more.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              <Link
                to="/signup"
                className="rounded-lg bg-gradient-to-r from-fuchsia-600 to-purple-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:from-fuchsia-500 hover:to-purple-500"
              >
                Join BM Support
              </Link>
              <Link
                to="/login"
                className="rounded-lg border border-purple-500/40 px-5 py-2.5 text-sm font-semibold text-purple-100 transition hover:bg-purple-900/50"
              >
                Sign in
              </Link>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
