import { useMemo, useRef } from "react";
import { sanitizeRichHtml } from "@/lib/sanitize-html";
import { useLoadSocialEmbeds, embedSocialUrls } from "@/lib/forum-embeds";

/**
 * Renders forum post HTML safely. Legacy plain-text posts (no `<` in the body)
 * fall back to a whitespace-pre-wrap block with the original `> ` quote
 * convention preserved visually.
 */
export function ForumPostBody({ html, className }: { html: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  // Re-run embed conversion at render time so posts saved before the X/FB
  // URL detector was fixed (e.g. URLs ending in `?s=20`) still hydrate into
  // proper embeds without requiring the author to edit & re-save.
  const processed = useMemo(() => embedSocialUrls(html), [html]);
  useLoadSocialEmbeds(ref, [processed]);

  const looksLikeHtml = /<[a-z][\s\S]*>/i.test(processed);
  if (!looksLikeHtml) {
    return (
      <div ref={ref} className={`text-[15px] leading-relaxed whitespace-pre-wrap break-words text-foreground/90 ${className ?? ""}`}>
        {processed.split("\n").map((line, i) =>
          line.startsWith("> ") ? (
            <div key={i} className="border-l-3 border-primary/70 pl-4 italic text-muted-foreground my-1.5 bg-primary/5 py-1 pr-2 rounded-r">
              {line.slice(2)}
            </div>
          ) : (
            <div key={i}>{line || "\u00A0"}</div>
          ),
        )}
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className={`prose dark:prose-invert max-w-none break-words text-[15px] leading-relaxed text-foreground/90 [&_.video-embed]:!w-full [&_.video-embed]:!max-w-none [&_.video-embed]:!my-3 [&_.video-embed]:!mx-0 [&_blockquote]:border-l-4 [&_blockquote]:border-primary/70 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-muted-foreground [&_blockquote]:bg-primary/5 [&_blockquote]:py-2.5 [&_blockquote]:rounded-r [&_blockquote]:my-2 [&_a]:text-primary [&_a]:underline [&_a]:font-medium [&_pre]:bg-muted [&_pre]:p-3 [&_pre]:rounded-md [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-1 [&_p]:my-2 [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:my-3 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:my-2.5 [&_.mention]:inline-flex [&_.mention]:items-center [&_.mention]:rounded-md [&_.mention]:px-1.5 [&_.mention]:py-0.5 [&_.mention]:font-semibold [&_.mention]:text-[#E11B22] [&_.mention]:bg-[#E11B22]/10 [&_.mention]:no-underline [&_.mention[data-mention-type=special]]:text-[#F4B400] [&_.mention[data-mention-type=special]]:bg-[#F4B400]/15 ${className ?? ""}`}
      dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(processed) }}
    />
  );
}