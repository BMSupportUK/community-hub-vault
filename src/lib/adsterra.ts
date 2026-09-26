/**
 * Adsterra advert configuration.
 *
 * Adsterra runs ALONGSIDE Google AdSense: on every page load each advert slot
 * flips a coin (ADSTERRA_SHARE) and is filled by either network (see
 * AdSenseSlot.tsx). Slots whose kind has no matching Adsterra zone always use
 * AdSense, and unfilled slots keep the placeholder panel.
 *
 * Banner zones (one per size, from the Adsterra dashboard "Banner" code):
 *   31421164 — 468x60   wide banner  → "topic" + "home" slots
 *   31421166 — 728x90   wide banner  → "welcome" slot (guides hero area)
 *   31421165 — 160x600  skyscraper   → "sidebar" slots
 *   31421167 — 300x250  rectangle    → "talk" slots
 *
 * Each dashboard snippet looks like:
 *   <script> atOptions = { 'key' : '<KEY>', 'format' : 'iframe',
 *     'height' : H, 'width' : W, 'params' : {} }; </script>
 *   <script src="https://www.highrevenueformat.com/<KEY>/invoke.js"></script>
 * Copy the key (and the host from the invoke.js src) into the matching zone
 * below. While a zone's key is empty it stays inert and its slots keep using
 * AdSense — no component changes needed.
 */

export interface AdsterraZone {
  id: string;
  size: string;
  width: number;
  height: number;
  /** The atOptions 'key' — empty until the dashboard snippet is pasted in. */
  key: string;
  /** Host from the invoke.js src, e.g. www.highrevenueformat.com. */
  host: string;
}

export const ADSTERRA_ZONES: Record<AdsterraZoneSize, AdsterraZone> = {
  "468x60": { id: "31421164", size: "468x60", width: 468, height: 60, key: "29d36d2e0295dbfee9149c7277c3e70d", host: "www.highrevenueformat.com" },
  "728x90": { id: "31421166", size: "728x90", width: 728, height: 90, key: "", host: "" },
  "160x600": { id: "31421165", size: "160x600", width: 160, height: 600, key: "", host: "" },
  "300x250": { id: "31421167", size: "300x250", width: 300, height: 250, key: "", host: "" },
};

export type AdsterraZoneSize = keyof typeof ADSTERRA_ZONES;
export type AdsterraSlotKind = "topic" | "sidebar" | "home" | "talk" | "welcome";

/** Share of page loads each slot gives to Adsterra when its zone is filled. */
export const ADSTERRA_SHARE = 0.5;

const ZONE_BY_SLOT: Record<AdsterraSlotKind, AdsterraZoneSize> = {
  topic: "468x60",
  home: "468x60",
  welcome: "728x90",
  sidebar: "160x600",
  talk: "300x250",
};

/** True once at least one Adsterra zone key is filled in. */
export const ADSTERRA_ENABLED = Object.values(ADSTERRA_ZONES).some(
  (zone) => zone.key.length > 0,
);

/** The zone config for a slot kind, or null when that slot has no Adsterra zone. */
export function adsterraZoneFor(kind: AdsterraSlotKind): AdsterraZone | null {
  const zone = ADSTERRA_ZONES[ZONE_BY_SLOT[kind]];
  return zone.key ? zone : null;
}

/** The banner size reserved for a slot kind, so the container can fit it. */
export function adsterraSizeFor(kind: AdsterraSlotKind): AdsterraZoneSize {
  return ZONE_BY_SLOT[kind];
}

const injected = new Set<string>();

/** True when this zone's loader already ran on the current page. */
export function isAdsterraZoneInjected(key: string): boolean {
  return injected.has(key);
}

// The classic Adsterra banner code sets one global `atOptions` and loads the
// zone's invoke.js, which renders the banner. Two zones on one page would
// race over that global, so injections are serialized: each zone's config is
// written immediately before its loader runs, and the next zone waits.
let chain: Promise<void> = Promise.resolve();

/**
 * Injects the Adsterra banner for a zone into the slot's mount element.
 * Runs once per zone per page; a second slot reusing the zone is left to
 * AdSense by the caller (isAdsterraZoneInjected).
 */
export function ensureAdsterraBanner(zone: AdsterraZone, mount: HTMLElement) {
  if (!zone.key || typeof document === "undefined") return;
  if (injected.has(zone.key)) return;
  injected.add(zone.key);
  chain = chain.then(
    () =>
      new Promise<void>((resolve) => {
        const config = document.createElement("script");
        config.type = "text/javascript";
        config.textContent =
          `atOptions = { 'key' : '${zone.key}', 'format' : 'iframe', ` +
          `'height' : ${zone.height}, 'width' : ${zone.width}, 'params' : {} };`;

        const invoke = document.createElement("script");
        invoke.type = "text/javascript";
        invoke.async = false;
        invoke.src = `https://${zone.host}/${zone.key}/invoke.js`;

        // Safety net: some Adsterra banner loaders render with
        // document.write, which after page load would wipe the whole
        // document. While the loader runs we capture any write and put it
        // inside the slot's mount instead, then restore the originals.
        const originalWrite = document.write.bind(document);
        const originalWriteln = document.writeln.bind(document);
        let captured = "";
        const capture = (html: string) => {
          captured += html;
        };
        (document as { write: unknown }).write = capture;
        (document as { writeln: unknown }).writeln = capture;

        const finish = () => {
          (document as { write: unknown }).write = originalWrite;
          (document as { writeln: unknown }).writeln = originalWriteln;
          if (captured) mount.innerHTML = captured;
          resolve();
        };

        invoke.onload = finish;
        invoke.onerror = finish;
        // Never leave the originals patched if the loader never fires.
        window.setTimeout(finish, 10000);

        mount.appendChild(config);
        mount.appendChild(invoke);
      }),
  );
}
