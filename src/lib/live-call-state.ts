import { useSyncExternalStore } from "react";

/** True while a video call screen is open, so pop-ups stay off the call. */
let calls = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function enterLiveCall() {
  calls++;
  emit();
  return () => { calls = Math.max(0, calls - 1); emit(); };
}
export const isInLiveCall = () => calls > 0;
export function useInLiveCall() {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, isInLiveCall, () => false);
}
