import { createFileRoute, Link } from "@tanstack/react-router";
import { LandingHeader } from "@/components/LandingHeader";
import { listPublicGuides, type PublicGuideSummary } from "@/lib/public-guides.functions";
import { CalendarDays } from "lucide-react";

export const Route = createFileRoute("/guides/")({
  loader: () => listPublicGuides(),
  head: () => ({
    meta: [
      { title: "Sports Guides & TV Listings | BM Support" },
      {
        name: "description",
        content:
          "Free public sports guides from BM Support — upcoming fixtures, dates and start times across football, boxing, F1, NFL and more.",
      },
      { property: "og:title", content: "Sports Guides & TV Listings | BM Support" },
      {
        property: "og:description",
        content:
          "Upcoming fixtures, dates and start times across football, boxing, F1, NFL and more.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://bmsupport.uk/guides" },
      { rel: "canonical", href: "https://bmsupport.uk/guides" },
    ],
  }),
  component: PublicGuidesPage,
});

function PublicGuidesPage() {
  const guides = Route.useLoaderData() as PublicGuideSummary[];

  const byCategory = new Map<string, PublicGuideSummary[]>();
  for (const g of guides) {
    const list = byCategory.get(g.category) ?? [];
    list.push(g);
    byCategory.set(g.category, list);
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <LandingHeader />
      <main className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-8">
        <h1 className="text-3xl font-bold sm:text-4xl">Sports Guides</h1>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground sm:text-base">
          Upcoming fixtures with dates and start times, updated regularly by the
          BM Support team. Members get the full guides inside the app, including
          exactly which channels are showing every event.
        </p>

        {guides.length === 0 && (
          <p className="mt-10 text-muted-foreground">
            New guides are on the way — check back soon.
          </p>
        )}

        {[...byCategory.entries()].map(([category, items]) => (
          <section key={category} className="mt-10">
            <h2 className="text-xl font-semibold text-red-300">{category}</h2>
            <ul className="mt-4 space-y-3">
              {items.map((g) => (
                <li key={g.id}>
                  <Link
                    to="/guides/$id"
                    params={{ id: g.id }}
                    className="block rounded-xl border border-border bg-card/60 p-4 transition hover:border-red-400/50 hover:bg-card"
                  >
                    <span className="font-semibold text-foreground">{g.title}</span>
                    {g.excerpt && (
                      <span className="mt-1 block text-sm text-muted-foreground">
                        {g.excerpt}
                      </span>
                    )}
                    <span className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <CalendarDays className="h-3.5 w-3.5" />
                      {new Date(g.created_at).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </main>
    </div>
  );
}
