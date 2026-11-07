package uk.bmsupport.player;

import androidx.media3.common.MediaItem;
import androidx.media3.exoplayer.ExoPlayer;

/**
 * Carries the Live TV preview's already-playing player into full screen, so opening the
 * previewed channel doesn't reconnect to the provider or reload the stream. Only one player
 * ever exists (UHD boxes have a single 4K decoder). Unclaimed hand-offs are released.
 */
final class PreviewHandoff {
    static final long MAX_AGE_MS = 5000;
    private static ExoPlayer player;
    private static String id;
    private static long at;

    private PreviewHandoff() {}

    /** True when the preview can be carried over: same live channel and it is actually playing. */
    static boolean canCarry(String kind, String previewId, String wantedId, boolean previewReady) {
        return "live".equals(kind) && previewReady && previewId != null && previewId.equals(wantedId);
    }

    static synchronized void offer(ExoPlayer p, String contentId) {
        drop();
        player = p; id = contentId; at = android.os.SystemClock.elapsedRealtime();
    }

    /** The carried-over player for this channel, or null (then full screen opens the stream itself). */
    static synchronized ExoPlayer take(String contentId) {
        ExoPlayer p = claimable(id, contentId, at, android.os.SystemClock.elapsedRealtime()) ? player : null;
        if (p == null) drop(); else { player = null; id = null; }
        return p;
    }

    static boolean claimable(String heldId, String wantedId, long heldAt, long now) {
        return heldId != null && heldId.equals(wantedId) && now - heldAt <= MAX_AGE_MS;
    }

    static synchronized void drop() {
        if (player != null) { try { player.release(); } catch (RuntimeException ignored) {} }
        player = null; id = null;
    }

    /** Which of the full-screen addresses the carried player is already on (0 when unknown). */
    static int urlIndex(ExoPlayer p, String[] urls) {
        MediaItem mi = p.getCurrentMediaItem();
        String cur = mi != null && mi.localConfiguration != null ? mi.localConfiguration.uri.toString() : null;
        return indexOf(cur, urls);
    }

    static int indexOf(String cur, String[] urls) {
        if (cur == null || urls == null) return 0;
        for (int i = 0; i < urls.length; i++) if (cur.equals(urls[i])) return i;
        return 0;
    }
}
