/**
 * Customer account profiles: each app login credential is its own profile
 * with its own BM Player account number. The chosen profile is remembered per
 * user on this device so the portal shows that login's details and number.
 */
export interface AccountProfile {
  id: string;
  login: string | null;
  accountNumber: number;
  playerNumber: number | null;
  accountType: string | null;
  expiryAt: string | null;
}

const KEY = (userId: string) => `bm-active-profile:${userId}`;
const CHOSEN = (userId: string) => `bm-profile-chosen:${userId}`;
const EVENT = "bm-active-profile-change";

/** The profile to show: the saved one if it still exists, else the first. */
export function pickActiveProfile<T extends { id: string }>(profiles: T[], savedId: string | null): T | null {
  if (profiles.length === 0) return null;
  return profiles.find((p) => p.id === savedId) ?? profiles[0];
}

/** The chooser opens only for customers with 2+ logins who haven't picked this session. */
export function needsProfileChoice(profileCount: number, chosenThisSession: boolean): boolean {
  return profileCount > 1 && !chosenThisSession;
}

export function readActiveProfileId(userId: string): string | null {
  try { return localStorage.getItem(KEY(userId)); } catch { return null; }
}

export function wasProfileChosen(userId: string): boolean {
  try { return sessionStorage.getItem(CHOSEN(userId)) === "1"; } catch { return true; }
}

export function saveActiveProfile(userId: string, id: string) {
  try {
    localStorage.setItem(KEY(userId), id);
    sessionStorage.setItem(CHOSEN(userId), "1");
  } catch { /* storage unavailable */ }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { userId } }));
}

export function requestProfileChooser(userId: string) {
  try { sessionStorage.removeItem(CHOSEN(userId)); } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { userId } }));
}

export const ACTIVE_PROFILE_EVENT = EVENT;
