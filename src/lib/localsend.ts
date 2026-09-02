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

export type LocalSendReceiveEvent = {
  phase:
    | "listening"
    | "stopped"
    | "incoming"
    | "receiving"
    | "received"
    | "installing"
    | "cancelled"
    | "error";
  fileName: string;
  percent: number;
  error: string;
};

export interface LocalSendPlugin {
  scan(): Promise<void>;
  /** Turns this device (e.g. a Fire Stick) into a LocalSend receiver. */
  startReceiver(): Promise<{ running: boolean }>;
  stopReceiver(): Promise<{ running: boolean }>;
  receiverStatus(): Promise<{ running: boolean }>;
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
  addListener(
    eventName: "localSendReceive",
    listener: (event: LocalSendReceiveEvent) => void,
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
