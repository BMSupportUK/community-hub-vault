export const PROVIDER_FEE_REFRESH_MS = 60_000;
export function changedProviderFee(recorded: number | null, latest: number | null): number | null {
  return latest !== null && Number.isSafeInteger(latest) && latest >= 0 && latest !== recorded ? latest : null;
}
export function nextFeeOffset(offset: number, count: number): number {
  return count < 25 ? 0 : offset + count;
}
