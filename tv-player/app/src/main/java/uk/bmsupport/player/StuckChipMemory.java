package uk.bmsupport.player;

import android.content.Context;

/**
 * Channels whose feed jams this box's hardware video chip within its first pictures (picture frozen,
 * sound playing) are remembered on the device and decoded in software by the first player from then
 * on. Learned from what the chip does on each channel, never from a list of names.
 */
final class StuckChipMemory {
    static final int EARLY_STALL_FRAMES = 60, CAP = 200;
    private static final String KEY = "stuck_chip_channels";

    static String key(String name) {
        return name == null ? "" : name.toLowerCase(java.util.Locale.ROOT).replaceAll("[^\\p{L}\\p{N}]", "");
    }
    /** A freeze within the first EARLY_STALL_FRAMES rendered pictures means the chip jammed, not the feed. */
    static boolean chipJammed(boolean hardware, int renderedFrames) { return hardware && renderedFrames >= 0 && renderedFrames < EARLY_STALL_FRAMES; }

    static boolean matches(java.util.Set<String> saved, String name) {
        String k = key(name);
        if (k.isEmpty()) return false;
        for (String s : saved) if (!s.isEmpty() && k.startsWith(s)) return true;
        return false;
    }
    static boolean stuck(Context c, String name) {
        return matches(PlayerActivity.prefs(c).getStringSet(KEY, java.util.Collections.emptySet()), name);
    }
    static void mark(Context c, String name) {
        String k = key(name);
        if (k.isEmpty()) return;
        java.util.Set<String> s = new java.util.LinkedHashSet<>(PlayerActivity.prefs(c).getStringSet(KEY, java.util.Collections.emptySet()));
        if (s.size() >= CAP) s.remove(s.iterator().next());
        s.add(k);
        PlayerActivity.prefs(c).edit().putStringSet(KEY, s).apply();
    }
}
