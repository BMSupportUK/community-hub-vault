/**
 * Detects match-day team sheet posts so they can be shown in the "Teams" tab.
 *
 * PROTECTED: headings are written by `src/lib/boro-team-sheet.server.ts`
 * (`buildTeamSheetBody`) as "Team news — <team|official|updated …> line-up".
 * Keep this matcher permissive about what sits between the dash and "line-up"
 * so new team labels (Boro, the opposition club name) never vanish from the tab.
 */
export function isTeamSheetPost(body: string | null | undefined): boolean {
  if (!body) return false;
  const text = body.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").toLowerCase();
  return /team news\s*[—–-]\s*[^.<]{0,60}?line-?up/.test(text) || /confirmed line-?ups?/.test(text);
}
