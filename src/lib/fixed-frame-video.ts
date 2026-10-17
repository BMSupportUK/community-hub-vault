/**
 * Customer phone camera → fixed-size square picture for the call.
 *
 * Phones change the camera's picture shape when the screen turns, and many
 * phones' video encoders then send only black until the connection is rebuilt.
 * Drawing the camera into a canvas that never changes size means the encoder
 * never sees a shape change, so turning the phone can't black out the call.
 * While the camera is being swapped, the last picture stays on screen.
 */
export const FIXED_FRAME_SIZE = 720;

export type FixedFrameStats = {
  srcState: string;
  srcMuted: boolean;
  srcEnabled: boolean;
  srcReady: number;
  srcW: number;
  srcH: number;
  srcPaused: boolean;
  luma: number;
  blackMs: number;
  stalls: number;
  heals: number;
  outState: string;
  outEnabled: boolean;
};

export type FixedFrameVideo = {
  track: MediaStreamTrack;
  stats: () => FixedFrameStats;
  setSource: (track: MediaStreamTrack | null) => void;
  stop: () => void;
};

/** Where to draw a w×h picture inside a size×size square, keeping its shape. */
export function fitContain(w: number, h: number, size: number) {
  if (w <= 0 || h <= 0) return { x: 0, y: 0, w: 0, h: 0 };
  const scale = Math.min(size / w, size / h);
  const dw = Math.round(w * scale);
  const dh = Math.round(h * scale);
  return { x: Math.round((size - dw) / 2), y: Math.round((size - dh) / 2), w: dw, h: dh };
}

/**
 * Staff side: show only the real camera picture from the fixed square, at the
 * customer's actual shape (tall when held upright, wide when turned).
 * `box` is the visible picture before any CSS turn; `square` is the size to
 * draw the whole square so the bars fall outside the box. Unknown shape
 * (older customer page) keeps the plain full-stage view.
 */
export function cropView(stageW: number, stageH: number, shape: { w: number; h: number } | null, sideways: boolean) {
  const sw = sideways ? stageH : stageW;
  const sh = sideways ? stageW : stageH;
  if (!shape || shape.w <= 0 || shape.h <= 0 || sw <= 0 || sh <= 0) return { boxW: sw, boxH: sh, square: null as number | null };
  const scale = Math.min(sw / shape.w, sh / shape.h);
  const boxW = Math.round(shape.w * scale);
  const boxH = Math.round(shape.h * scale);
  return { boxW, boxH, square: Math.max(boxW, boxH) };
}

export function createFixedFrameVideo(onStall?: (hard: boolean) => void, onShape?: (w: number, h: number) => void, size = FIXED_FRAME_SIZE): FixedFrameVideo | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  if (typeof canvas.captureStream !== "function") return null;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, size, size);
  const out = canvas.captureStream(30).getVideoTracks()[0];
  if (!out) return null;

  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.autoplay = true;
  // Some phone browsers only play videos that are on the page.
  video.setAttribute("aria-hidden", "true");
  video.style.cssText = "position:fixed;left:0;top:0;width:2px;height:2px;opacity:0;pointer-events:none;";
  document.body.appendChild(video);
  let source: MediaStreamTrack | null = null;
  let lastTime = -1;
  let lastAdvance = performance.now();
  let stopped = false;
  let shapeKey = "";
  // The camera itself can keep running but deliver only black after a turn on
  // some Android phones: sample what we send and ask for a fresh camera.
  const probe = document.createElement("canvas");
  probe.width = 16;
  probe.height = 12;
  const pctx = probe.getContext("2d", { willReadFrequently: true });
  let tick = 0;
  let luma = -1;
  let blackSince = 0;
  let lastHeal = 0;
  let healGap = 3000;
  let stalls = 0;
  let heals = 0;
  const heal = (now: number) => {
    if (now - lastHeal < healGap) return;
    lastHeal = now;
    // A really dark room shouldn't restart the camera every few seconds.
    healGap = Math.min(healGap * 2, 30000);
    heals++;
    // Re-attach first (cheap), then a brand-new camera.
    const t = source;
    if (t && t.readyState === "live") { video.srcObject = new MediaStream([t]); video.play().catch(() => {}); }
    onStall?.(true);
  };

  const draw = () => {
    if (stopped) return;
    const now = performance.now();
    if (source) out.enabled = source.enabled;
    if (source?.enabled && video.readyState >= 2 && video.videoWidth > 0) {
      if (video.currentTime !== lastTime) { lastTime = video.currentTime; lastAdvance = now; }
      const key = `${video.videoWidth}x${video.videoHeight}`;
      if (key !== shapeKey) { shapeKey = key; onShape?.(video.videoWidth, video.videoHeight); }
      const r = fitContain(video.videoWidth, video.videoHeight, size);
      ctx.fillRect(0, 0, size, size);
      ctx.drawImage(video, r.x, r.y, r.w, r.h);
    }
    // Camera stopped delivering a picture: ask for a fresh one.
    if (source?.enabled && now - lastAdvance > 2500) { lastAdvance = now; stalls++; heal(now); }
    if (source && source.readyState === "ended") heal(now);
    if (pctx && source?.enabled && ++tick % 10 === 0) {
      try {
        pctx.drawImage(canvas, 0, 0, 16, 12);
        const d = pctx.getImageData(0, 0, 16, 12).data;
        let max = 0;
        for (let i = 0; i < d.length; i += 4) max = Math.max(max, 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
        luma = Math.round(max);
        if (max < 12) { blackSince ||= now; if (now - blackSince > 1500) heal(now); }
        else { blackSince = 0; healGap = 3000; }
      } catch { /* unreadable */ }
    }
    if (video.paused && source) video.play().catch(() => {});
  };
  // Timer, not animation frames: keeps drawing even while the browser is busy turning the screen.
  const timer = window.setInterval(draw, 1000 / 30);

  return {
    track: out,
    stats: () => ({
      srcState: source?.readyState ?? "none",
      srcMuted: !!source?.muted,
      srcEnabled: !!source?.enabled,
      srcReady: video.readyState,
      srcW: video.videoWidth,
      srcH: video.videoHeight,
      srcPaused: video.paused,
      luma,
      blackMs: blackSince ? Math.round(performance.now() - blackSince) : 0,
      stalls,
      heals,
      outState: out.readyState,
      outEnabled: out.enabled,
    }),
    setSource(track) {
      source = track;
      lastTime = -1;
      lastAdvance = performance.now();
      blackSince = 0;
      video.srcObject = track ? new MediaStream([track]) : null;
      if (track) video.play().catch(() => {});
    },
    stop() {
      stopped = true;
      window.clearInterval(timer);
      video.srcObject = null;
      video.remove();
      out.stop();
    },
  };
}
