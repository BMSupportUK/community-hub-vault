/** Preserve line breaks that an admin types into visible HTML text nodes. */
export function preserveEmailLineBreaks(html: string) {
  return html.replace(/(^|>)([^<]+)(?=<|$)/g, (match, prefix: string, text: string) => {
    if (!text.trim() || !/\r?\n/.test(text)) return match;
    return `${prefix}${text.replace(/\r?\n/g, "<br />")}`;
  });
}