import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/2fa-help/$token")({
  component: RetiredPlayerHelp,
  head: () => ({ meta: [
    { title: "Device linking help | BM Support" },
    { name: "description", content: "This old player help link is no longer active. Link your BM Player through your website account." },
    { property: "og:title", content: "Device linking help | BM Support" },
    { property: "og:description", content: "Link your BM Player through your BM Support website account." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
    { name: "robots", content: "noindex, nofollow" },
  ] }),
});

function RetiredPlayerHelp() {
  return <main className="min-h-dvh bg-background text-foreground flex flex-col items-center justify-center gap-4 p-6 text-center">
    <h1 className="font-display text-2xl font-bold">This help link is no longer active</h1>
    <p>Use the linking code displayed in BM Player on your website’s Link Device page.</p>
    <Button asChild><Link to="/">BM Support</Link></Button>
  </main>;
}