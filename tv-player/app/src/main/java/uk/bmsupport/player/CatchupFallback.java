package uk.bmsupport.player;

/** Decides when a catch-up recording that VLC couldn't play should be retried in BM Player's own player. */
final class CatchupFallback {
    private CatchupFallback() {}
    /** VLC's official result codes: connection failed, playback error, video track lost. */
    static boolean vlcError(int res) { return res >= 2 && res <= 4; }
    /** Error result, or VLC came straight back (under 10s) without reaching any picture. */
    static boolean vlcFailed(int res, long elapsedMs, long positionMs) {
        return vlcError(res) || (elapsedMs < 10000 && positionMs <= 0);
    }
}
