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

export type FixedFrameVideo = {
  track: MediaStreamTrack;
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

export function createFixedFrameVideo(onStall?: () => void, size = FIXED_FRAME_SIZE): FixedFrameVideo | null {
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

  const draw = () => {
    if (stopped) return;
    const now = performance.now();
    if (source) out.enabled = source.enabled;
    if (source?.enabled && video.readyState >= 2 && video.videoWidth > 0) {
      if (video.currentTime !== lastTime) { lastTime = video.currentTime; lastAdvance = now; }
      const r = fitContain(video.videoWidth, video.videoHeight, size);
      ctx.fillRect(0, 0, size, size);
      ctx.drawImage(video, r.x, r.y, r.w, r.h);
    }
    // Camera stopped delivering a picture: ask for a fresh one.
    if (source?.enabled && now - lastAdvance > 2500) { lastAdvance = now; onStall?.(); }
    if (video.paused && source) video.play().catch(() => {});
  };
  // Timer, not animation frames: keeps drawing even while the browser is busy turning the screen.
  const timer = window.setInterval(draw, 1000 / 30);

  return {
    track: out,
    setSource(track) {
      source = track;
      lastTime = -1;
      lastAdvance = performance.now();
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
