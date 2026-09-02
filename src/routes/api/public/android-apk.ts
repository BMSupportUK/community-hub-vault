import { createFileRoute } from "@tanstack/react-router";
import { ANDROID_RELEASE } from "@/lib/android-release";

/**
 * Serves the latest signed BM Support APK with the correct Android
 * package mime type + filename.
 *
 * The raw asset CDN stores the file as `application/zip`, which makes
 * browsers save it as `.zip`. This route proxies the same bytes with
 * `application/vnd.android.package-archive` and an explicit
 * `Content-Disposition` filename so phones always get a real `.apk`.
 */
export const Route = createFileRoute("/api/public/android-apk")({
  server: {
    handlers: {
      GET: async ({ request }) => handle(request, "GET"),
      HEAD: async ({ request }) => handle(request, "HEAD"),
    },
  },
});

async function handle(request: Request, method: "GET" | "HEAD") {
  const origin = new URL(request.url).origin;
  const target = new URL(ANDROID_RELEASE.url, origin).toString();

  const range = request.headers.get("range");
  const upstream = await fetch(target, {
    method,
    headers: range ? { range } : undefined,
  });

  if (!upstream.ok && upstream.status !== 206) {
    return new Response("App file unavailable", { status: 502 });
  }

  const fileName = `BMSupport-${ANDROID_RELEASE.versionName}.apk`;
  const headers = new Headers();
  headers.set("content-type", "application/vnd.android.package-archive");
  headers.set("content-disposition", `attachment; filename="${fileName}"`);
  headers.set("accept-ranges", "bytes");
  headers.set("cache-control", "public, max-age=300");
  for (const key of ["content-length", "content-range", "etag", "last-modified"]) {
    const value = upstream.headers.get(key);
    if (value) headers.set(key, value);
  }

  return new Response(method === "HEAD" ? null : upstream.body, {
    status: upstream.status,
    headers,
  });
}
