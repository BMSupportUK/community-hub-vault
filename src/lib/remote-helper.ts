import { Capacitor, registerPlugin } from "@capacitor/core";

export type RemoteHelperStatus = {
  installed: boolean;
  version: string | null;
  canInstall: boolean;
  accessibilityOn: boolean;
  sdk: number;
};

type RemoteHelperPlugin = {
  status(): Promise<RemoteHelperStatus>;
  allowInstalls(): Promise<void>;
  install(): Promise<void>;
  openAccessibility(): Promise<void>;
  openHelper(): Promise<void>;
};

export const RemoteHelper = registerPlugin<RemoteHelperPlugin>("RemoteHelper");

/** True only inside the BM Support Android app (the in-app installer lives there). */
export function remoteHelperAvailable(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}
