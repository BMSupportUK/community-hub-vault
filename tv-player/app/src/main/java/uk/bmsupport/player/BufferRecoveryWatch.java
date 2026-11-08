package uk.bmsupport.player;

/** A stalled connection is retried only when neither playback nor loading makes progress. */
final class BufferRecoveryWatch {
    private long lastProgressAt = -1, bufferedPosition = -1;
    void reset() { lastProgressAt = -1; bufferedPosition = -1; }
    boolean progressed(long buffered) { return bufferedPosition >= 0 && buffered > bufferedPosition; }
    boolean retry(long now, long buffered, long timeout, boolean buffering, boolean playWhenReady) {
        if (!buffering || !playWhenReady) { reset(); return false; }
        if (lastProgressAt < 0 || buffered > bufferedPosition) lastProgressAt = now;
        bufferedPosition = buffered;
        return now - lastProgressAt >= timeout;
    }
}