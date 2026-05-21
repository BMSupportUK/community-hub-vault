import { saveSubscription, removeSubscription } from "./push.functions";

const VAPID_PUBLIC_KEY = "BD9Va9J0l6BMmpUuUyeUAG3zZ1x3GUc29WHmMPZtJRowqqDGr9KmbBQqH6p699WFj9Xmf5s_Vqo602MiCFKnjEI";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export function pushSupported() {
  if (typeof window === "undefined") return false;
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export function isInIframe() {
  try { return window.self !== window.top; } catch { return true; }
}

export function isPreviewHost() {
  if (typeof window === "undefined") return false;
  const h = window.location.hostname;
  return h.includes("id-preview--") || h.includes("lovableproject.com") || h.includes("lovable.app");
}

async function getRegistration() {
  let reg = await navigator.serviceWorker.getRegistration("/sw.js");
  if (!reg) reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  await navigator.serviceWorker.ready;
  return reg;
}

export async function getPushStatus(): Promise<"unsupported" | "denied" | "subscribed" | "default"> {
  if (!pushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  try {
    const reg = await navigator.serviceWorker.getRegistration("/sw.js");
    if (!reg) return Notification.permission === "granted" ? "default" : "default";
    const sub = await reg.pushManager.getSubscription();
    if (sub) return "subscribed";
    return Notification.permission === "granted" ? "default" : "default";
  } catch {
    return "default";
  }
}

export async function enablePush() {
  if (!pushSupported()) throw new Error("Push notifications are not supported on this device/browser.");
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error("Notification permission was not granted.");
  const reg = await getRegistration();
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }
  const json = sub.toJSON();
  await saveSubscription({
    data: {
      endpoint: sub.endpoint,
      p256dh: json.keys?.p256dh ?? "",
      auth: json.keys?.auth ?? "",
      userAgent: navigator.userAgent.slice(0, 500),
    },
  });
}

export async function disablePush() {
  if (!pushSupported()) return;
  const reg = await navigator.serviceWorker.getRegistration("/sw.js");
  if (!reg) return;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  try { await removeSubscription({ data: { endpoint: sub.endpoint } }); } catch {}
  await sub.unsubscribe();
}