import { createFileRoute } from "@tanstack/react-router";

const TWEET_ID = /^\d{1,40}$/;
const SYNDICATION_URL = "https://cdn.syndication.twimg.com/tweet-result";
const OEMBED_URL = "https://publish.twitter.com/oembed";
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
          return getOembedFallback(id);
        }

        const contentType = res.headers.get("content-type") ?? "";
        if (!res.ok || !contentType.includes("application/json")) {
          return getOembedFallback(id);
        }

        const data = await res.json();
        if (data?.__typename === "TweetTombstone" || (data && Object.keys(data).length === 0)) {
          return getOembedFallback(id);
        }

        return json({ data }, 200);
      },
    },
  },
});

function getToken(id: string) {
  return ((Number(id) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, "");
}

async function getOembedFallback(id: string) {
  const url = new URL(OEMBED_URL);
  url.searchParams.set("url", `https://x.com/i/status/${id}`);
  url.searchParams.set("omit_script", "true");
  url.searchParams.set("dnt", "true");
  url.searchParams.set("theme", "dark");

  try {
    const res = await fetch(url, { headers: { accept: "application/json" } });
    const contentType = res.headers.get("content-type") ?? "";
    if (!res.ok || !contentType.includes("application/json")) {
      return json({ data: null, error: "Tweet preview unavailable" }, res.status === 404 ? 404 : 502);
    }

    const embed = await res.json() as { html?: string; author_name?: string; author_url?: string; url?: string };
    const html = embed.html ?? "";
    const handle = embed.author_url?.match(/x\.com\/([^/?#]+)/i)?.[1];
    return json({
      data: {
        __typename: "Tweet",
        id_str: id,
        text: htmlToTweetText(html),
        user: {
          name: embed.author_name,
          screen_name: handle,
        },
      },
    }, 200);
  } catch {
    return json({ data: null, error: "Tweet preview unavailable" }, 502);
  }
}

function htmlToTweetText(html: string) {
  const paragraph = html.match(/<p\b[^>]*>([\s\S]*?)<\/p>/i)?.[1] ?? "";
  return decodeHtml(paragraph
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<a\b[^>]*>([\s\S]*?)<\/a>/gi, "$1")
    .replace(/<[^>]+>/g, "")
    .trim());
}

function decodeHtml(text: string) {
  return text
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function json(body: unknown, status: number) {
  return Response.json(body, {
    status,
    headers: {
      "cache-control": "public, max-age=300, stale-while-revalidate=86400",
    },
  });
}