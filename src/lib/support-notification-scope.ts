/** BM Support alerts belong only to BM Support, even for dual-role staff. */
export function supportNotificationsEnabled(isFanZoneOnly: boolean, inFanZone: boolean): boolean {
  return !isFanZoneOnly && !inFanZone;
}