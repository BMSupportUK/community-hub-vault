package uk.bmsupport.player;

/** Duration/position rules shared by persisted progress and resume controls. */
final class WatchProgress {
    static boolean eligible(String kind) { return "vod".equals(kind) || "episode".equals(kind); }
    static int percent(long position, long duration) {
        return duration <= 0 ? 0 : (int) Math.min(100, Math.max(0, position) * 100.0 / duration);
    }
    static boolean resumable(long position, long duration) {
        return position > 0 && duration > 0 && position < duration;
    }
}