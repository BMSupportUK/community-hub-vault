import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/_approved/reviews")({
  head: () => ({
    meta: [
      { title: "Customer Reviews — BM Support" },
      { name: "description", content: "Read and submit customer reviews for BM Support." },
      { property: "og:title", content: "Customer Reviews — BM Support" },
      { property: "og:description", content: "Read and submit customer reviews for BM Support." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});