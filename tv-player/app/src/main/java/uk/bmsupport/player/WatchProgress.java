package uk.bmsupport.player;

/** Duration/position rules shared by persisted progress and resume controls. */
final class WatchProgress {
    /** Completion is separate from the latest resume position: rewatching never clears it. */
    static boolean remembered(android.content.SharedPreferences prefs, String key) {
        return prefs.getBoolean(key + ":watched", false)
                || finished(prefs.getLong(key + ":position", 0), prefs.getLong(key + ":duration", 0));
    }
    static void store(android.content.SharedPreferences prefs, android.content.SharedPreferences.Editor edit,
                      String key, long position, long duration) {
        if (key == null || duration <= 0) return;
        boolean watched = remembered(prefs, key) || finished(position, duration);
        edit.putLong(key + ":position", Math.max(0, position)).putLong(key + ":duration", duration)
                .putBoolean(key + ":watched", watched);
    }
    static boolean eligible(String kind) { return "film".equals(kind) || "episode".equals(kind); }
    static int percent(long position, long duration) {
        return duration <= 0 ? 0 : (int) Math.min(100, Math.max(0, position) * 100.0 / duration);
    }
    /** 90% or more counts as watched: credits are usually skipped. */
    static boolean finished(long position, long duration) { return duration > 0 && percent(position, duration) >= 90; }
    static boolean resumable(long position, long duration) {
        return position > 0 && duration > 0 && position < duration;
    }
}