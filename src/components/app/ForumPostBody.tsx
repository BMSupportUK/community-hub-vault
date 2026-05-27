import { useRef } from "react";
import { sanitizeRichHtml } from "@/lib/sanitize-html";
import { useLoadSocialEmbeds } from "@/lib/forum-embeds";

/**
 * Renders forum post HTML safely. Legacy plain-text posts (no `<` in the body)
 * fall back to a whitespace-pre-wrap block with the original `> ` quote
 * convention preserved visually.
 */
export function ForumPostBody({ html, className }: { html: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useLoadSocialEmbeds(ref, [html]);

  const looksLikeHtml = /<[a-z][\s\S]*>/i.test(html);
  if (!looksLikeHtml) {
    return (
      <div ref={ref} className={`text-sm whitespace-pre-wrap break-words ${className ?? ""}`}>
        {html.split("\n").map((line, i) =>
          line.startsWith("> ") ? (
            <div key={i} className="border-l-2 border-amber-500/60 pl-3 italic text-muted-foreground">
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
      className={`prose prose-sm dark:prose-invert max-w-none break-words [&_.video-embed]:!w-full [&_.video-embed]:!max-w-none [&_.video-embed]:!my-3 [&_.video-embed]:!mx-0 [&_blockquote]:border-l-4 [&_blockquote]:border-[#E11B22]/70 [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:text-muted-foreground [&_blockquote]:bg-[#E11B22]/5 [&_blockquote]:py-2 [&_blockquote]:rounded-r [&_a]:text-[#E11B22] [&_a]:underline [&_pre]:bg-muted [&_pre]:p-2 [&_pre]:rounded [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_.mention]:inline-flex [&_.mention]:items-center [&_.mention]:rounded [&_.mention]:px-1 [&_.mention]:py-0 [&_.mention]:font-medium [&_.mention]:text-[#E11B22] [&_.mention]:bg-[#E11B22]/10 [&_.mention]:no-underline [&_.mention[data-mention-type=special]]:text-[#F4B400] [&_.mention[data-mention-type=special]]:bg-[#F4B400]/15 ${className ?? ""}`}
      dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(html) }}
    />
  );
}