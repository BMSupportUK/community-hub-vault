export function referralBonusExcluded(name: string | null | undefined): boolean {
  return ["gj", "gjs", "gjtestaccount", "dane", "danej", "danejsite"].includes((name ?? "").replace(/[^a-z0-9]/gi, "").toLowerCase());
}

export function historicalReferralBonusAdded(name: string | null, recordedName: string | undefined, rewardCount: number): boolean {
  return !!name && !referralBonusExcluded(name) && name === recordedName && rewardCount === 0;
}