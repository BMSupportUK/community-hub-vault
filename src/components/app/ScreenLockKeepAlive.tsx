import { createContext, useContext, useEffect } from "react";

export const ScreenLockKeepAliveContext = createContext<(() => () => void) | null>(null);

/** Keep a live TV relay mounted behind the secure lock, not visible or interactive. */
export function useScreenLockKeepAlive() {
  const register = useContext(ScreenLockKeepAliveContext);
  useEffect(() => register?.(), [register]);
}