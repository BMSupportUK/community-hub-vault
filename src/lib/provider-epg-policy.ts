/** Compatibility for released apps: null immediately selects their provider guide. */
export function countryEpgEnabled() { return false; }
export function providerGuideFallback() {
  return { epg_listings: null, source: 'none' as const };
}
export function retiredCategoryRefresh() {
  return { queued: 0, disabled: true };
}