/**
 * Estimates how much to trust an IP-based location, from how specific the
 * result is. Free IP geolocation does not return a true accuracy radius, so
 * the estimate is derived from the most specific field present.
 */
export function locationAccuracyKm(loc: {
  city?: string | null;
  region?: string | null;
  country?: string | null;
}): number | null {
  if (loc.city) return 25;
  if (loc.region) return 100;
  if (loc.country) return 1000;
  return null;
}

export function locationAccuracyLabel(loc: {
  city?: string | null;
  region?: string | null;
  country?: string | null;
}): string | null {
  const km = locationAccuracyKm(loc);
  return km == null ? null : `Accurate to ~${km.toLocaleString("en-GB")} km`;
}
