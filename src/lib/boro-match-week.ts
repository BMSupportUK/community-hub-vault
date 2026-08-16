/**
 * Match-centre week rules.
 *
 * The Boro match centre holds one fixture for the whole week (weeks start on
 * Monday, UK time). If a week has a midweek game and a weekend game, it only
 * switches to the second game a day after the midweek game finished.
 */

/** Midnight Monday (UK time) of the week containing `ms`, as epoch ms. */
export function londonWeekStart(ms: number): number {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const lastSunday = (year: number, monthOneBased: number) => {
    const x = new Date(Date.UTC(year, monthOneBased, 0));
    return x.getUTCDate() - x.getUTCDay();
  };
  const bstStart = Date.UTC(y, 2, lastSunday(y, 3), 1, 0);
  const bstEnd = Date.UTC(y, 9, lastSunday(y, 10), 1, 0);
  const offset = ms >= bstStart && ms < bstEnd ? 60 * 60 * 1000 : 0;
  const local = new Date(ms + offset);
  const dow = (local.getUTCDay() + 6) % 7; // Monday = 0
  const midnightLocal = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  return midnightLocal - dow * 24 * 60 * 60 * 1000 - offset;
}

export function pickWeeklyFixture<T extends { t: number; completed: boolean }>(
  all: T[],
  upcoming: T[],
  nowMs: number,
): T | undefined {
  const wk = londonWeekStart(nowMs);
  const sorted = [...all].sort((a, b) => a.t - b.t);
  const thisWeek = sorted.filter((p) => londonWeekStart(p.t) === wk);
  const notPlayed = thisWeek.filter((p) => !p.completed);
  const played = thisWeek.filter((p) => p.completed);
  if (notPlayed.length) {
    if (played.length) {
      const lastPlayed = played[played.length - 1]!;
      // ~2h to finish the game, then hold for a full day.
      const revealAt = lastPlayed.t + 26 * 60 * 60 * 1000;
      if (nowMs < revealAt) return lastPlayed;
    }
    return notPlayed[0];
  }
  // Every game this week has been played — hold it until Monday.
  if (thisWeek.length) return thisWeek[thisWeek.length - 1];
  return [...upcoming].sort((a, b) => a.t - b.t)[0];
}
