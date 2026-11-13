package uk.bmsupport.player;

import android.content.Context;
import android.media.MediaFormat;
import android.os.Handler;

import androidx.media3.common.Format;
import androidx.media3.exoplayer.mediacodec.MediaCodecSelector;
import androidx.media3.exoplayer.video.MediaCodecVideoRenderer;
import androidx.media3.exoplayer.video.VideoRendererEventListener;

/**
 * Feeds tagged H.264 level 5.0+ (e.g. avc1.640033) make hardware decoders hold up to 16 frames
 * before showing any; MediaTek chips then stop taking input and the picture freezes with sound
 * playing. For those feeds the decoder is opened in low-latency mode so each frame comes out as soon
 * as it is decoded. Chosen by feed format, never by channel name.
 */
final class HighLevelAvcRenderer extends MediaCodecVideoRenderer {
    HighLevelAvcRenderer(Context c, MediaCodecSelector s, long joiningMs, boolean fallback,
                         Handler h, VideoRendererEventListener l, int maxDropped) {
        super(c, s, joiningMs, fallback, h, l, maxDropped);
    }

    @Override protected MediaFormat getMediaFormat(Format format, String codecMimeType, CodecMaxValues max,
            float rate, boolean noPostProcess, int tunnelingSession) {
        MediaFormat f = super.getMediaFormat(format, codecMimeType, max, rate, noPostProcess, tunnelingSession);
        if (VideoDecodePolicy.lowLatencyDecode(format.codecs)) f.setInteger("low-latency", 1);
        return f;
    }
}
