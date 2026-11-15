package uk.bmsupport.player;

/** Live TV drop recovery: keep reopening the same channel for up to two minutes with growing gaps before giving up. */
final class LiveReconnect {
    static final long WINDOW_MS = 120000;
    private static final long[] GAPS = {1000, 2000, 3000, 5000, 8000, 10000};
    private long since = -1; private int tries;
    private long lastPictures = -1, lastAudio = -1, progressAt = -1;
    static final long STALL_MS = 12000;

    /** Catch disconnected feeds that emit neither an error nor an end event. */
    boolean stalled(long pictures, long audio, long now) {
        if (lastPictures < 0 || pictures > lastPictures || audio > lastAudio) progressAt = now;
        lastPictures = pictures; lastAudio = audio;
        return progressAt >= 0 && now - progressAt >= STALL_MS;
    }
    void opened(long now) { lastPictures = -1; lastAudio = -1; progressAt = now; }

    /** Records one failure; returns the wait before the next reopen, or -1 once the two-minute window is used up. */
    long failed(long now) {
        if (since < 0) since = now;
        if (now - since >= WINDOW_MS) return -1;
        return GAPS[Math.min(tries++, GAPS.length - 1)];
    }
    boolean active() { return since >= 0; }
    void recovered() { since = -1; tries = 0; }
}
