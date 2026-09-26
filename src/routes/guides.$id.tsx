import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { LandingHeader } from "@/components/LandingHeader";
import { getPublicGuide, type PublicGuideDetail } from "@/lib/public-guides.functions";
import { Clock, CalendarDays, Lock, ArrowLeft } from "lucide-react";

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
        <Link to="/guides" className="mt-6 inline-block text-red-300 underline underline-offset-4">
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
      <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-8">
        <Link
          to="/guides"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> All sports guides
        </Link>

        <p className="mt-6 text-xs font-semibold uppercase tracking-widest text-red-300">
          {guide.category}
        </p>
        <h1 className="mt-2 text-3xl font-bold sm:text-4xl">{guide.title}</h1>
        {guide.excerpt && (
          <p className="mt-3 text-muted-foreground">{guide.excerpt}</p>
        )}
        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
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
              <p key={i} className="text-sm text-muted-foreground">
                {note}
              </p>
            ))}
          </div>
        )}

        <ul className="mt-8 space-y-3">
          {guide.events.map((e, i) => (
            <li
              key={i}
              className="rounded-xl border border-border bg-card/60 p-4"
            >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                {e.date && (
                  <span className="font-semibold text-red-200">{e.date}</span>
                )}
                {e.time && (
                  <span className="inline-flex items-center gap-1 font-semibold text-foreground">
                    <Clock className="h-3.5 w-3.5" />
                    {e.time}
                  </span>
                )}
              </div>
              <p className="mt-1.5 font-medium text-foreground">{e.title}</p>
            </li>
          ))}
        </ul>

        <div className="mt-10 rounded-2xl border border-red-400/30 bg-red-950/20 p-6 text-center">
          <Lock className="mx-auto h-6 w-6 text-red-300" />
          <h2 className="mt-3 text-lg font-semibold">
            Want to know which channels are showing these?
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            BM Support members get the full guide inside the app — every event
            with its exact channel listings, plus live chat, support tickets
            and more.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <Link
              to="/signup"
              className="rounded-lg bg-red-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-red-500"
            >
              Join BM Support
            </Link>
            <Link
              to="/login"
              className="rounded-lg border border-border px-5 py-2.5 text-sm font-semibold transition hover:bg-card"
            >
              Sign in
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
