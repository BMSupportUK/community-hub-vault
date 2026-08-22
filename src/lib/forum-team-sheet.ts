/** Detects match-day team sheet posts so they can be shown in the "Teams" tab. */
export function isTeamSheetPost(body: string | null | undefined): boolean {
  if (!body) return false;
  const text = body.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").toLowerCase();
  return /team news\s*[—–-]\s*(updated\s+)?(official\s+)?line-?up/.test(text) || /confirmed line-?ups?/.test(text);
}
