/** Preserve line breaks that an admin types into visible HTML text nodes. */
export function preserveEmailLineBreaks(html: string) {
  let protectedTag: "pre" | "script" | "style" | "textarea" | null = null;

  return html.replace(/<[^>]*>|[^<]+/g, (token) => {
    if (token.startsWith("<")) {
      const closing = token.match(/^<\s*\/\s*(pre|script|style|textarea)\b/i)?.[1]?.toLowerCase();
      const opening = token.match(/^<\s*(pre|script|style|textarea)\b/i)?.[1]?.toLowerCase();
      if (closing && closing === protectedTag) protectedTag = null;
      else if (opening && !token.match(/\/\s*>$/)) protectedTag = opening as typeof protectedTag;
      return token;
    }

    if (protectedTag || !token.trim() || !/\r?\n/.test(token)) return token;
    return token.replace(/\r?\n/g, "<br />");
  });
}