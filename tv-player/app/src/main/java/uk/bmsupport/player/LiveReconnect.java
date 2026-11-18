package uk.bmsupport.player;

/** Live TV drop recovery: keep reopening the same channel for up to two minutes with growing gaps before giving up. */
final class LiveReconnect {
    static final long WINDOW_MS = 120000;
    private static final long[] GAPS = {0, 2000, 3000, 5000, 8000, 10000};
    private long since = -1; private int tries;
    private long lastPictures = -1, lastAudio = -1, progressAt = -1;
    static final long STALL_MS = 3000;
    static final long UHD_STALL_MS = 30000, UHD_NO_DATA_MS = 20000;
    private long stallMs = STALL_MS, noDataMs = 3000;
    /** UHD channels wait longer before a gap counts as a drop, as other players do. */
    void patient(boolean uhd) { stallMs = uhd ? UHD_STALL_MS : STALL_MS; noDataMs = uhd ? UHD_NO_DATA_MS : NO_DATA_MS; }
    long stallMs() { return stallMs; }
    long noDataMs() { return noDataMs; }

    /** Catch disconnected feeds that emit neither an error nor an end event. */
    boolean stalled(long pictures, long audio, long now) {
        if (lastPictures < 0 || pictures > lastPictures || audio > lastAudio) progressAt = now;
        lastPictures = pictures; lastAudio = audio;
        return progressAt >= 0 && now - progressAt >= stallMs;
    }
    void opened(long now) { lastPictures = -1; lastAudio = -1; progressAt = now; lastBytes = -1; bytesAt = now; soundSeen = false; muteAudio = -1; muteAt = -1; lastLost = -1; blockySince = -1; }

    static final long SILENT_MS = 8000;
    private boolean soundSeen; private long muteAudio = -1, muteAt = -1;
    /** Sound dropped out while the picture keeps going: once a channel has had audio, 8s without new audio means reopen it. */
    boolean soundLost(long pictures, long audio, long now) {
        if (muteAudio >= 0 && audio > muteAudio) soundSeen = true;
        if (muteAudio < 0 || audio > muteAudio) { muteAudio = audio; muteAt = now; return false; }
        return soundSeen && pictures > 0 && now - muteAt >= SILENT_MS;
    }

    private long lastBytes = -1, bytesAt = -1;
    static final long NO_DATA_MS = 3000;
    /** The server stopped sending: no new bytes for 3s means the feed dropped even if VLC still reports Playing. */
    boolean noData(long readBytes, long now) {
        if (lastBytes < 0 || readBytes > lastBytes) bytesAt = now;
        lastBytes = readBytes;
        return bytesAt >= 0 && now - bytesAt >= noDataMs;
    }

    /** Records one failure; returns the wait before the next reopen, or -1 once the two-minute window is used up. */
    long failed(long now) {
        if (since < 0) since = now;
        if (now - since >= WINDOW_MS) return -1;
        return GAPS[Math.min(tries++, GAPS.length - 1)];
    }
    private final java.util.ArrayDeque<Long> fails = new java.util.ArrayDeque<>();
    static final int BACKUP_AFTER = 3;
    /** Counts one failed reconnect; true once the channel has failed 3 times inside two minutes, so a backup channel should take over. */
    boolean wantsBackup(long now) {
        fails.addLast(now);
        while (!fails.isEmpty() && now - fails.peekFirst() > WINDOW_MS) fails.removeFirst();
        return fails.size() >= BACKUP_AFTER;
    }

    static final long BLOCKY_MS = 10000;
    private long lastLost = -1, blockySince = -1;
    /** Damaged pictures keep arriving for 10s (blocky picture): reopen the channel. */
    boolean blocky(long lostPictures, long now) {
        boolean rising = lastLost >= 0 && lostPictures > lastLost;
        lastLost = lostPictures;
        if (!rising) { if (blockySince >= 0 && lostPictures >= 0) blockySince = -1; return false; }
        if (blockySince < 0) blockySince = now;
        return now - blockySince >= BLOCKY_MS;
    }

    boolean active() { return since >= 0; }
    void recovered() { since = -1; tries = 0; }
}
