// BM Support push notifications service worker
self.addEventListener("install", (e) => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch (_) {
    payload = { title: "BM Support", body: event.data ? event.data.text() : "" };
  }
  const title = payload.title || "BM Support";

  event.waitUntil((async () => {
    // Ask any open app window to play the uploaded voice clip instead of the
    // generic OS notification chime.
    let playedInApp = false;
    if (payload.sound) {
      const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const c of clients) {
        try {
          const channel = new MessageChannel();
          const acknowledged = new Promise((resolve) => {
            const timeout = setTimeout(() => resolve(false), 1200);
            channel.port1.onmessage = (message) => {
              clearTimeout(timeout);
              resolve(message.data?.played === true);
            };
          });
          c.postMessage(
            { type: "bm-play-sound", sound: payload.sound },
            [channel.port2],
          );
          if (await acknowledged) {
            playedInApp = true;
            break;
          }
        } catch (_) { /* noop */ }
      }
    }

    const options = {
      body: payload.body || "",
      icon: payload.icon || "/favicon.ico",
      badge: payload.badge || "/favicon.ico",
      tag: payload.tag || "bm-support",
      data: { url: payload.url || "/status" },
      vibrate: [120, 60, 120],
      renotify: true,
      // Suppress the default chime when the app itself is playing the clip.
      silent: playedInApp,
    };
    await self.registration.showNotification(title, options);
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) {
      if ("focus" in c) { c.navigate(url); return c.focus(); }
    }
    return self.clients.openWindow(url);
  })());
});
