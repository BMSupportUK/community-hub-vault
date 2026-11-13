package uk.bmsupport.player;

import android.content.Context;
import android.os.Handler;

import androidx.media3.exoplayer.mediacodec.MediaCodecSelector;
import androidx.media3.exoplayer.video.MediaCodecVideoRenderer;
import androidx.media3.exoplayer.video.VideoRendererEventListener;

/**
 * Main-player video renderer for live channels and films. Stock Media3 throws away every picture
 * frame once the video falls half a second behind the sound and then waits for the next keyframe;
 * IPTV feeds such as VIP Cinema send keyframes rarely, so the picture sat frozen with sound playing
 * until the freeze watch restarted it (the backup engine never discards frames, which is why it
 * played). Here late frames are never dropped to a keyframe and are shown at least every
 * FORCE_RENDER_US, so the picture keeps moving and catches up by itself.
 */
final class KeepFramesRenderer extends MediaCodecVideoRenderer {
    /** Show a late frame at least this often (40 ms = 25 fps) instead of discarding it. */
    static final long FORCE_RENDER_US = 40_000;
    /** Stock Media3 drops late frames past 30 ms behind; keep that so slightly-late frames still pace. */
    static final long LATE_US = 30_000;

    /** Worst lateness seen (ms) and how often stock Media3 would have frozen to a keyframe. */
    volatile long worstLateMs;
    volatile int keyframeSkipsAvoided;

    KeepFramesRenderer(Context c, MediaCodecSelector selector, long joiningMs, boolean fallback,
                       Handler h, VideoRendererEventListener l, int maxDropped) {
        super(c, selector, joiningMs, fallback, h, l, maxDropped);
    }

    static boolean dropToKeyframe(long earlyUs, boolean isLastBuffer) { return false; }
    static boolean forceRender(long earlyUs, long elapsedSinceLastRenderUs) {
        return earlyUs < -LATE_US && elapsedSinceLastRenderUs >= FORCE_RENDER_US;
    }

    private void note(long earlyUs) {
        long lateMs = -earlyUs / 1000;
        if (lateMs > worstLateMs) worstLateMs = lateMs;
    }

    @Override protected boolean shouldDropBuffersToKeyframe(long earlyUs, long elapsedRealtimeUs, boolean isLastBuffer) {
        note(earlyUs);
        if (super.shouldDropBuffersToKeyframe(earlyUs, elapsedRealtimeUs, isLastBuffer)) keyframeSkipsAvoided++;
        return dropToKeyframe(earlyUs, isLastBuffer);
    }
    @Override protected boolean shouldDropOutputBuffer(long earlyUs, long elapsedRealtimeUs, boolean isLastBuffer) {
        note(earlyUs);
        return earlyUs < -LATE_US && !isLastBuffer;
    }
    @Override protected boolean shouldForceRenderOutputBuffer(long earlyUs, long elapsedSinceLastRenderUs) {
        return forceRender(earlyUs, elapsedSinceLastRenderUs);
    }

    /** Short text added to freeze reports so the website shows why a picture stopped. */
    String stats() { return " late" + worstLateMs + "ms kf" + keyframeSkipsAvoided; }
}
