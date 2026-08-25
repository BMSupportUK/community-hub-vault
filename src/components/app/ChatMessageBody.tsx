import { sanitizeRichHtml } from "@/lib/sanitize-html";
import { MentionText, isRoleMentionTag } from "@/components/app/mentions";
import { cn } from "@/lib/utils";

const HTML_TAG_RE = /<(\/?)(b|strong|i|em|u|s|strike|del|ul|ol|li|p|div|br|span|blockquote|code)\b/i;

/** True when the stored message content was produced by the rich composer. */
export function isRichChatContent(content: string): boolean {
  return HTML_TAG_RE.test(content);
}

/** Highlight @mentions inside HTML text nodes (outside tags/attributes). */
function highlightMentions(html: string, me: string | null): string {
  return html.replace(/(<[^>]+>)|(@[\w.-]+)/g, (match, tag: string | undefined, mention: string | undefined) => {
    if (tag || !mention) return match;
    const key = mention.slice(1).toLowerCase();
    const isBroadcast = key === "all" || key === "here";
    const isMe = !!me && key === me;
    const cls = isMe
      ? "bg-amber-300 text-amber-950 ring-amber-500"
      : isBroadcast
        ? "bg-rose-600 text-white ring-rose-700"
        : isRoleMentionTag(key)
          ? "bg-emerald-600 text-white ring-emerald-700"
          : "bg-indigo-600 text-white ring-indigo-700";
    return `<span class="inline-block rounded px-1.5 py-0.5 font-semibold ring-1 ${cls}">${mention}</span>`;
  });
}

/**
 * Render a chat message. Formatted messages (bold/italic/alignment/lists from
 * the composer toolbar) render as sanitized HTML; everything else keeps the
 * existing plain-text renderer with links, mentions and profanity filtering.
 */
export function ChatMessageBody({
  content,
  currentUsername,
  className,
}: {
  content: string;
  currentUsername?: string | null;
  className?: string;
}) {
  if (!isRichChatContent(content)) {
    return <MentionText content={content} currentUsername={currentUsername} className={className} />;
  }
  const me = currentUsername?.toLowerCase() ?? null;
  const html = sanitizeRichHtml(highlightMentions(content, me));
  return (
    <div
      className={cn(
        "text-sm break-words [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-5 [&_ol]:pl-5 [&_a]:underline [&_a]:text-blue-600 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-2 [&_blockquote]:text-muted-foreground",
        className,
      )}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
