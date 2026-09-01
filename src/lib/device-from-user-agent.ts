/**
 * Maps a raw user-agent string to a friendly device label for the app
 * download log. Pure function — safe to import anywhere.
 */

const FIRE_MODELS: Record<string, string> = {
  AFTMM: "Fire TV Stick 4K",
  AFTKA: "Fire TV Stick 4K Max",
  AFTKM: "Fire TV Stick 4K Max (2nd gen)",
  AFTKRT: "Fire TV Stick 4K (2023)",
  AFTSSS: "Fire TV Stick (3rd gen)",
  AFTSS: "Fire TV Stick Lite",
  AFTT: "Fire TV Stick (2nd gen)",
  AFTM: "Fire TV Stick (1st gen)",
  AFTB: "Fire TV (1st gen)",
  AFTS: "Fire TV (2nd gen)",
  AFTN: "Fire TV (3rd gen)",
  AFTR: "Fire TV Cube",
  AFTA: "Fire TV Cube (2nd gen)",
  AFTGAZL: "Fire TV Cube (3rd gen)",
  AFTLE: "Fire TV (Toshiba/Insignia)",
  AFTBAMR: "Fire TV Omni",
  AFTEU: "Fire TV Edition TV",
  AFTEUFF: "Fire TV Edition TV",
  AFTJMST: "Fire TV Edition TV",
  AFTDCT31: "Fire TV Smart TV",
};

function browserName(ua: string): string | null {
  if (/\bEdg[A-Z]?\//.test(ua)) return "Edge";
  if (/\bOPR\/|\bOpera\b/.test(ua)) return "Opera";
  if (/\bSamsungBrowser\//.test(ua)) return "Samsung Internet";
  if (/\bFirefox\//.test(ua)) return "Firefox";
  if (/\bChrome\//.test(ua)) return "Chrome";
  if (/\bSafari\//.test(ua)) return "Safari";
  return null;
}

function withBrowser(base: string, ua: string) {
  const b = browserName(ua);
  return b ? `${base} (${b})` : base;
}

/** Returns a human-readable device label, or "Unknown device". */
export function deviceFromUserAgent(userAgent: string | null | undefined): string {
  const ua = (userAgent ?? "").trim();
  if (!ua) return "Unknown device";

  // Amazon Fire hardware codes can appear with or without the Downloader app.
  const fireCode = Object.keys(FIRE_MODELS).find((code) =>
    new RegExp(`\\b${code}\\b`, "i").test(ua),
  );
  const isDownloader = /Downloader|AFTDownloader|com\.esaba\.downloader/i.test(ua);
  if (fireCode) {
    const model = FIRE_MODELS[fireCode];
    return isDownloader ? `${model} (Downloader app)` : model;
  }
  if (isDownloader) return "Fire TV / Android TV (Downloader app)";

  if (/SHIELD|NVIDIA/i.test(ua)) return "NVIDIA SHIELD";
  if (/CrKey|Chromecast|Google TV/i.test(ua)) return "Chromecast / Google TV";
  if (/Android ?TV|GoogleTV|BRAVIA|Philips.*TV|MiTV|MiBOX|Nokia.*TV/i.test(ua))
    return "Android TV box";
  if (/Formuler|Dreamlink|BuzzTV|MAG ?\d|Zgemma/i.test(ua)) return "IPTV set-top box";
  if (/Tizen|Web0S|webOS|SmartTV|SMART-TV|HbbTV/i.test(ua)) return "Smart TV";
  if (/Roku/i.test(ua)) return "Roku";
  if (/Xbox/i.test(ua)) return "Xbox";
  if (/PlayStation/i.test(ua)) return "PlayStation";

  if (/\bAndroid\b/i.test(ua)) {
    const tablet = !/Mobile/i.test(ua);
    return withBrowser(tablet ? "Android tablet" : "Android phone", ua);
  }
  if (/\biPad\b/i.test(ua)) return withBrowser("iPad", ua);
  if (/\biPhone\b/i.test(ua)) return withBrowser("iPhone", ua);
  if (/\biPod\b/i.test(ua)) return withBrowser("iPod touch", ua);
  if (/Macintosh|Mac OS X/i.test(ua)) return withBrowser("Mac", ua);
  if (/Windows NT/i.test(ua)) return withBrowser("Windows PC", ua);
  if (/CrOS/i.test(ua)) return withBrowser("Chromebook", ua);
  if (/Linux/i.test(ua)) return withBrowser("Linux PC", ua);

  if (/^curl\//i.test(ua)) return "curl (command line)";
  if (/^Wget/i.test(ua)) return "wget (command line)";
  if (/aria2|axel|HTTPie|python-requests|okhttp|Dalvik/i.test(ua)) return "Download tool / script";
  if (/bot|crawler|spider|preview|scanner/i.test(ua)) return "Bot / scanner";

  return "Unknown device";
}

/** Best-effort client IP from proxy headers. */
export function clientIpFromHeaders(headers: Headers): string | null {
  const candidates = [
    headers.get("cf-connecting-ip"),
    headers.get("x-real-ip"),
    (headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim(),
  ];
  for (const c of candidates) {
    if (c && c.length > 2) return c;
  }
  return null;
}
