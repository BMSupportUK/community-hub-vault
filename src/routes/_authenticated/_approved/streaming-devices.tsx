import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/_approved/streaming-devices")({
  head: () => ({
    meta: [
      { title: "Streaming Device Reviews — BM Support" },
      { name: "description", content: "Compare recommended streaming devices and compatibility notes." },
      { property: "og:title", content: "Streaming Device Reviews — BM Support" },
      { property: "og:description", content: "Compare recommended streaming devices and compatibility notes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});