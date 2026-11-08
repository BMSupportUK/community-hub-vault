package uk.bmsupport.player;

/** One measurement per real backup stall; never counts initial loading or a pause. */
final class BackupStallTracker {
    private long since = -1;
    long update(boolean stalled, long now) {
        if (stalled) {
            if (since < 0) since = now - 2000;
            return 0;
        }
        return finish(now);
    }
    long finish(long now) {
        if (since < 0) return 0;
        long duration = Math.max(0, now - since);
        since = -1;
        return duration;
    }
}