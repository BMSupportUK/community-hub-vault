import { createFileRoute } from "@tanstack/react-router";
import { WebPlayer } from "@/components/player-web/WebPlayer";

export const Route = createFileRoute("/_authenticated/player-web")({
  head: () => ({
    meta: [
      { title: "BM Player for iPhone and iPad | BM Support" },
      { name: "description", content: "Watch Live TV, films, series and catch up in BM Player on your iPhone or iPad." },
      { property: "og:title", content: "BM Player for iPhone and iPad" },
      { property: "og:description", content: "Watch Live TV, films, series and catch up in BM Player on your iPhone or iPad." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "BM Player" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
    ],
    links: [
      { rel: "manifest", href: "/player-web.webmanifest" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
    ],
  }),
  component: WebPlayer,
});
