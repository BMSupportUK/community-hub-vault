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
      className={`prose prose-sm dark:prose-invert max-w-none break-words [&_blockquote]:border-l-4 [&_blockquote]:border-amber-500/60 [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:text-muted-foreground [&_a]:text-primary [&_a]:underline [&_pre]:bg-muted [&_pre]:p-2 [&_pre]:rounded [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 ${className ?? ""}`}
      dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(html) }}
    />
  );
}