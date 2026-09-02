import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";

export type LocalSendDevice = {
  ip: string;
  port: number;
  protocol: string;
  alias: string;
  deviceModel: string;
  deviceType: string;
  fingerprint: string;
};

export type LocalSendProgress = {
  phase: "preparing" | "waiting" | "sending" | "done";
  percent: number;
};

export interface LocalSendPlugin {
  scan(): Promise<void>;
  send(options: {
    deviceIp: string;
    port: number;
    protocol: string;
    url: string;
    fileName: string;
    size: number;
  }): Promise<{ ok: boolean }>;
  cancel(): Promise<void>;
  addListener(
    eventName: "localSendDevice",
    listener: (device: LocalSendDevice) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: "localSendProgress",
    listener: (progress: LocalSendProgress) => void,
  ): Promise<PluginListenerHandle>;
}

export const LocalSend = registerPlugin<LocalSendPlugin>("LocalSend");

/** Wi-Fi sending only exists inside our native Android app. */
export function isLocalSendAvailable() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

export function deviceLabel(d: LocalSendDevice) {
  const name = d.alias?.trim() || d.deviceModel?.trim();
  return name && name !== d.ip ? name : `Device ${d.ip}`;
}
