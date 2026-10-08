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

function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** Admin-uploaded APK (Owner tools) wins over the bundled release. */
async function uploadedApk(): Promise<{ url: string; version: string } | null> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.from("app_settings").select("value").eq("key", "android_apk_upload").maybeSingle();
    const v = data?.value as { path?: string; version?: string } | null;
    if (!v?.path) return null;
    // An older admin upload must never shadow a newer bundled release.
    if (compareVersions(v.version || "0", ANDROID_RELEASE.versionName) < 0) return null;
    const { data: signed } = await supabaseAdmin.storage.from("android-app").createSignedUrl(v.path, 600);
    return signed?.signedUrl ? { url: signed.signedUrl, version: v.version || "latest" } : null;
  } catch (e) {
    console.error("[android-apk] uploaded lookup failed", e);
    return null;
  }
}

async function handle(request: Request, method: "GET" | "HEAD") {
  const origin = new URL(request.url).origin;
  const uploaded = await uploadedApk();
  const target = uploaded?.url ?? new URL(ANDROID_RELEASE.assetUrl, origin).toString();

  const range = request.headers.get("range");
  const upstream = await fetch(target, {
    method,
    headers: range ? { range } : undefined,
  });

  if (!upstream.ok && upstream.status !== 206) {
    return new Response("App file unavailable", { status: 502 });
  }

  const fileName = `BMSupport-${uploaded?.version ?? ANDROID_RELEASE.versionName}.apk`;
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
