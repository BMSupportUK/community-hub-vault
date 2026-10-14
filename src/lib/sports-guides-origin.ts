import { useLayoutEffect, useEffect, useState } from "react";
import { isFanZonePath } from "@/lib/fan-zone-nav";

/**
 * The sports guides are shared by BM Support and the Boro Fan Zone. Whichever
 * side the reader came from keeps its own chrome (rail + header) on the guides.
 * The last side visited is remembered for the tab session.
 */
const KEY = "sports-guides-origin";
export type SiteSide = "fanzone" | "support";

export function isSportsGuidesPath(path: string): boolean {
  return path === "/sports-guides" || path.startsWith("/sports-guides/");
}

export function rememberSiteSide(side: SiteSide) {
  try {
    sessionStorage.setItem(KEY, side);
  } catch {
    /* ignore */
  }
}

export function readSiteSide(): SiteSide | null {
  try {
    const v = sessionStorage.getItem(KEY);
    return v === "fanzone" || v === "support" ? v : null;
  } catch {
    return null;
  }
}

/** Pure decision used by the hook (and tests). */
export function sportsGuidesUseFanZone(
  path: string,
  stored: SiteSide | null,
  isFanZoneOnly: boolean,
): boolean {
  if (!isSportsGuidesPath(path)) return false;
  if (isFanZoneOnly) return true;
  return stored === "fanzone";
}

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * True when the current page should wear Fan Zone chrome: a Fan Zone page, or
 * the sports guides reached from the Fan Zone (or by a Fan-Zone-only member).
 */
export function useInFanZoneChrome(path: string, isFanZoneOnly: boolean): boolean {
  const [stored, setStored] = useState<SiteSide | null>(null);
  useIsoLayoutEffect(() => {
    if (isFanZonePath(path)) {
      rememberSiteSide("fanzone");
      setStored("fanzone");
    } else if (!isSportsGuidesPath(path) && path !== "/" && !path.startsWith("/login")) {
      rememberSiteSide("support");
      setStored("support");
    } else {
      setStored(readSiteSide());
    }
  }, [path]);
  return isFanZonePath(path) || sportsGuidesUseFanZone(path, stored, isFanZoneOnly);
}
