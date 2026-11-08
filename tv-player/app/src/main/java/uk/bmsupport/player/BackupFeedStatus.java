package uk.bmsupport.player;

/** VLC's buffering percentage is not a playback stall; require stopped progress too. */
final class BackupFeedStatus {
    private boolean buffering;
    private long lastProgressAt;
    private long lastPosition = -1;

    void reset(long now) {
        buffering = false;
        lastProgressAt = now;
        lastPosition = -1;
    }

    void buffering(float percent) { buffering = percent < 100f; }

    void progress(long position, long now) {
        if (position >= 0 && position != lastPosition) {
            lastPosition = position;
            lastProgressAt = now;
        }
    }

    void playing(long now) { lastProgressAt = now; buffering = false; }

    boolean stalled(boolean started, boolean playing, long now) {
        return started && playing && buffering && now - lastProgressAt >= 2000;
    }
}