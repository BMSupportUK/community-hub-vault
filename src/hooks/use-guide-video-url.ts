import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getGuideVideoUrl } from "@/lib/guide-video.functions";

/**
 * Turns a stored guide-video reference into a short-lived signed URL.
 * Returns null while resolving (or if the video is unavailable).
 */
export function useGuideVideoUrl(ref: string | null | undefined, blogId?: string) {
  const resolve = useServerFn(getGuideVideoUrl);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setUrl(null);
    if (!ref) return;
    resolve({ data: { ref, blogId } })
      .then((r) => { if (active) setUrl(r?.url ?? null); })
      .catch(() => { if (active) setUrl(null); });
    return () => { active = false; };
  }, [ref, blogId]);

  return url;
}
