/**
 * True only on Android and iOS phones/tablets. Video help is phone-only: the
 * customer points their phone camera at the device they're installing on,
 * while staff watch from a desktop. Safe during SSR (returns false).
 */
export function isMobilePhone(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /Android|iPhone|iPad|iPod/i.test(ua);
}
