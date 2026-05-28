import { createFileRoute } from "@tanstack/react-router";

const TWEET_ID = /^\d{1,40}$/;
const SYNDICATION_URL = "https://cdn.syndication.twimg.com/tweet-result";
const FEATURES = [
  "tfw_timeline_list:",
  "tfw_follower_count_sunset:true",
  "tfw_tweet_edit_backend:on",
  "tfw_refsrc_session:on",
  "tfw_fosnr_soft_interventions_enabled:on",
  "tfw_show_birdwatch_pivots_enabled:on",
  "tfw_show_business_verified_badge:on",
  "tfw_duplicate_scribes_to_settings:on",
  "tfw_use_profile_image_shape_enabled:on",
  "tfw_show_blue_verified_badge:on",
  "tfw_legacy_timeline_sunset:true",
  "tfw_show_gov_verified_badge:on",
  "tfw_show_business_affiliate_badge:on",
  "tfw_tweet_edit_frontend:on",
].join(";");

export const Route = createFileRoute("/api/public/tweet")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const id = new URL(request.url).searchParams.get("id") ?? "";
        if (!TWEET_ID.test(id)) {
          return Response.json({ data: null, error: "Invalid tweet id" }, { status: 400 });
        }

        const url = new URL(SYNDICATION_URL);
        url.searchParams.set("id", id);
        url.searchParams.set("lang", "en");
        url.searchParams.set("features", FEATURES);
        url.searchParams.set("token", getToken(id));

        const res = await fetch(url, {
          headers: {
            accept: "application/json",
          },
        });

        if (res.status === 404) {
          return json({ data: null }, 404);
        }

        const contentType = res.headers.get("content-type") ?? "";
        if (!res.ok || !contentType.includes("application/json")) {
          return json({ data: null, error: "Tweet preview unavailable" }, 502);
        }

        const data = await res.json();
        if (data?.__typename === "TweetTombstone" || (data && Object.keys(data).length === 0)) {
          return json({ data: null }, 404);
        }

        return json({ data }, 200);
      },
    },
  },
});

function getToken(id: string) {
  return ((Number(id) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, "");
}

function json(body: unknown, status: number) {
  return Response.json(body, {
    status,
    headers: {
      "cache-control": "public, max-age=300, stale-while-revalidate=86400",
    },
  });
}