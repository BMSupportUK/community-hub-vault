package uk.bmsupport.player;

import android.content.Context;
import android.media.MediaFormat;
import android.os.Handler;

import androidx.media3.common.Format;
import androidx.media3.exoplayer.ExoPlaybackException;
import androidx.media3.exoplayer.mediacodec.MediaCodecAdapter;
import androidx.media3.exoplayer.mediacodec.MediaCodecSelector;
import androidx.media3.exoplayer.video.MediaCodecVideoRenderer;
import androidx.media3.exoplayer.video.VideoRendererEventListener;

/**
 * Main-player video renderer. Some IPTV feeds stamp their pictures seconds ahead of their sound, so
 * Media3 decodes ~10 frames, then holds every finished picture waiting for the sound clock; the video
 * chip fills up and stops taking input (picture frozen, sound playing). libVLC resyncs such feeds,
 * which is why the backup engine plays them. Here, a picture held "too early" for HOLD_MS while
 * playing teaches a timing shift so video follows the sound clock; seeks/reopens clear it.
 * H.264 level 5.0+ feeds are also opened in low-latency mode.
 */
final class HighLevelAvcRenderer extends MediaCodecVideoRenderer {
    static final long EARLY_US = 400_000, HOLD_MS = 300, TARGET_EARLY_US = 30_000;
    private long shiftUs, heldSince = -1;
    volatile long worstEarlyMs, shiftMs;

    HighLevelAvcRenderer(Context c, MediaCodecSelector s, long joiningMs, boolean fallback,
                         Handler h, VideoRendererEventListener l, int maxDropped) {
        super(c, s, joiningMs, fallback, h, l, maxDropped);
    }

    /** Pure rule: new shift for a picture `earlyUs` ahead that has been held `heldMs`; -1 = keep. */
    static long learnShift(long currentShiftUs, long earlyUs, long heldMs) {
        if (earlyUs > EARLY_US && heldMs >= HOLD_MS) return currentShiftUs + earlyUs - TARGET_EARLY_US;
        if (earlyUs < -EARLY_US && currentShiftUs > 0) return Math.max(0, currentShiftUs + earlyUs + TARGET_EARLY_US);
        return -1;
    }

    @Override protected boolean processOutputBuffer(long positionUs, long elapsedRealtimeUs, MediaCodecAdapter codec,
            java.nio.ByteBuffer buffer, int index, int flags, int sampleCount, long ptsUs, boolean decodeOnly,
            boolean last, Format format) throws ExoPlaybackException {
        if (getState() == STATE_STARTED && !decodeOnly) {
            long earlyUs = ptsUs - shiftUs - positionUs;
            if (earlyUs / 1000 > worstEarlyMs) worstEarlyMs = earlyUs / 1000;
            long now = android.os.SystemClock.elapsedRealtime();
            if (earlyUs > EARLY_US) { if (heldSince < 0) heldSince = now; } else heldSince = -1;
            long next = learnShift(shiftUs, earlyUs, heldSince < 0 ? 0 : now - heldSince);
            if (next >= 0) { shiftUs = next; shiftMs = next / 1000; heldSince = -1; }
        } else heldSince = -1;
        return super.processOutputBuffer(positionUs, elapsedRealtimeUs, codec, buffer, index, flags, sampleCount,
                ptsUs - shiftUs, decodeOnly, last, format);
    }

    @Override protected void onPositionReset(long positionUs, boolean joining) throws ExoPlaybackException {
        shiftUs = 0; shiftMs = 0; heldSince = -1;
        super.onPositionReset(positionUs, joining);
    }

    String stats() { return " early" + worstEarlyMs + " shift" + shiftMs; }

    @Override protected MediaFormat getMediaFormat(Format format, String codecMimeType, CodecMaxValues max,
            float rate, boolean noPostProcess, int tunnelingSession) {
        MediaFormat f = super.getMediaFormat(format, codecMimeType, max, rate, noPostProcess, tunnelingSession);
        if (VideoDecodePolicy.lowLatencyDecode(format.codecs)) f.setInteger("low-latency", 1);
        return f;
    }
}
