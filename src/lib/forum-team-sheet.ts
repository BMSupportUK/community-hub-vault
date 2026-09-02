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

/**
 * Boro's own line-up must always appear first in the Teams tab, followed by
 * the opposition graphic. The heading carries the team label.
 */
export function isBoroTeamSheetPost(body: string | null | undefined): boolean {
  if (!body) return false;
  const text = body.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").toLowerCase();
  const heading = text.match(/team news\s*[—–-]\s*([^.<]{0,60}?)line-?up/)?.[1] ?? "";
  return /\bboro\b|\bmiddles(?:brough|borough)\b|\bmfc\b|\bofficial\b/.test(heading) || heading.trim() === "";
}

/** Sorts team sheet posts so Boro's XI is always listed first. */
export function sortTeamSheetPosts<T extends { body: string | null }>(posts: T[]): T[] {
  return posts
    .map((p, i) => ({ p, i, boro: isBoroTeamSheetPost(p.body) ? 0 : 1 }))
    .sort((a, b) => a.boro - b.boro || a.i - b.i)
    .map((x) => x.p);
}
