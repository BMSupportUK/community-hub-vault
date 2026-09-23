/**
 * Compresses a video file to 720p H.264/AAC MP4 in the browser using
 * ffmpeg.wasm, so uploads to the app-demos bucket stay small and start
 * playing quickly. Falls back to the original file if anything fails.
 */

const CORE_VERSION = "0.12.6";
const CORE_BASE = `https://cdn.jsdelivr.net/npm/@ffmpeg/core@${CORE_VERSION}/dist/esm`;
const TARGET_MAX_EDGE = 1280; // longest side
const MIN_SIZE_TO_COMPRESS = 8 * 1024 * 1024; // skip files already under 8 MB

let ffmpegPromise: Promise<import("@ffmpeg/ffmpeg").FFmpeg> | null = null;

async function getFFmpeg() {
  if (!ffmpegPromise) {
    ffmpegPromise = (async () => {
      const [{ FFmpeg }, { toBlobURL }] = await Promise.all([
        import("@ffmpeg/ffmpeg"),
        import("@ffmpeg/util"),
      ]);
      const ffmpeg = new FFmpeg();
      const [coreURL, wasmURL] = await Promise.all([
        toBlobURL(`${CORE_BASE}/ffmpeg-core.js`, "text/javascript"),
        toBlobURL(`${CORE_BASE}/ffmpeg-core.wasm`, "application/wasm"),
      ]);
      await ffmpeg.load({ coreURL, wasmURL });
      return ffmpeg;
    })();
    ffmpegPromise.catch(() => {
      ffmpegPromise = null;
    });
  }
  return ffmpegPromise;
}

export type CompressProgress = (stage: "loading" | "compressing", pct: number) => void;

/**
 * Returns a compressed MP4 File, or the original file when compression is
 * unnecessary or fails. `onProgress` receives 0-100 during compression.
 */
export async function compressVideoFile(file: File, onProgress?: CompressProgress): Promise<File> {
  if (!file.type.startsWith("video/")) return file;
  if (file.size < MIN_SIZE_TO_COMPRESS) return file;

  try {
    onProgress?.("loading", 0);
    const ffmpeg = await getFFmpeg();
    const { fetchFile } = await import("@ffmpeg/util");

    const inName = "in" + (file.name.match(/\.[a-z0-9]+$/i)?.[0] ?? ".mp4");
    const outName = "out.mp4";
    await ffmpeg.writeFile(inName, await fetchFile(file));

    const onFfmpegProgress = ({ progress }: { progress: number }) => {
      onProgress?.("compressing", Math.min(100, Math.max(0, Math.round(progress * 100))));
    };
    ffmpeg.on("progress", onFfmpegProgress);

    // Scale so the longest edge is 1280px (720p), keep aspect, even dims.
    const scale = `scale='if(gt(iw,ih),min(iw,${TARGET_MAX_EDGE}),-2)':'if(gt(iw,ih),-2,min(ih,${TARGET_MAX_EDGE}))'`;
    const ok = await ffmpeg.exec([
      "-i", inName,
      "-vf", scale,
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "26",
      "-pix_fmt", "yuv420p",
      "-c:a", "aac",
      "-b:a", "96k",
      "-movflags", "+faststart",
      outName,
    ]);
    ffmpeg.off("progress", onFfmpegProgress);
    if (ok !== 0) throw new Error("ffmpeg exited with " + ok);

    const data = await ffmpeg.readFile(outName);
    await ffmpeg.deleteFile(inName).catch(() => {});
    await ffmpeg.deleteFile(outName).catch(() => {});

    const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
    const compressed = new File(
      [bytes.buffer as ArrayBuffer],
      file.name.replace(/\.[a-z0-9]+$/i, "") + ".mp4",
      { type: "video/mp4" },
    );
    // Never replace with something larger.
    return compressed.size < file.size ? compressed : file;
  } catch {
    return file;
  }
}
