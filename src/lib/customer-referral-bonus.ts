export function referralBonusExcluded(name: string | null | undefined): boolean {
  return ["gj", "gjs", "gjtestaccount", "dane", "danej", "danejsite"].includes((name ?? "").replace(/[^a-z0-9]/gi, "").toLowerCase());
}

export function historicalReferralBonusAdded(name: string | null, recordedName: string | undefined, rewardCount: number): boolean {
  return !!name && !referralBonusExcluded(name) && name === recordedName && rewardCount === 0;
}

// Rewards are supplied only for completed, paid 12-month new-customer sales.
// A historical acknowledgement alone is not evidence of a qualifying purchase.
export function referralBonusState(name: string | null, rewards: { rewardedAt: string | null }[]): 'hidden' | 'pending' | 'added' {
  if (!name || referralBonusExcluded(name) || rewards.length === 0) return 'hidden';
  return rewards.some((reward) => !reward.rewardedAt) ? 'pending' : 'added';
}