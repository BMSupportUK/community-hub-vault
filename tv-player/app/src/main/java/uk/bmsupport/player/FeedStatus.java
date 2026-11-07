package uk.bmsupport.player;

/**
 * Live feed status pill shown while watching: "No picture" when the stream opens black,
 * "Buffering…" while a stall is being ridden out, hidden the rest of the time so the
 * picture stays clean. Pure logic so it can be unit-tested without a device.
 */
final class FeedStatus {
    static final String NO_PICTURE = "No picture";
    static final String BUFFERING = "Buffering…";

    private FeedStatus() {}

    /** Pill text for the current state, or null when the feed is healthy (pill hidden). */
    static String label(boolean noPicture, boolean buffering) {
        if (noPicture) return NO_PICTURE;
        if (buffering) return BUFFERING;
        return null;
    }
}
