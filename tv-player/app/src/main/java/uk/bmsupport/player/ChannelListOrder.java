package uk.bmsupport.player;

/**
 * Puts the Womens Football channels above the FA Player ones inside their shared
 * Live TV category. Every other channel keeps its existing order.
 * Channels of one family that end in a number (Tennis TV 01, Tennis TV 02, ...)
 * list in ascending number order even when the provider sends them backwards.
 */
final class ChannelListOrder {
    private ChannelListOrder() {}

    /** Lower ranks list first: Rugby Pass and Womens Football (0), then FA Player (1), then everything else (2). */
    static int rank(String name) {
        if (name == null) return 2;
        String n = name.trim().toLowerCase(java.util.Locale.ROOT);
        if (n.startsWith("rugby pass") || n.startsWith("rugbypass")) return 0;
        if (n.startsWith("womens football") || n.startsWith("women's football")) return 0;
        if (n.startsWith("fa player")) return 1;
        return 2;
    }

    /** Index where the trailing digit run starts, or -1 when the name does not end in digits. */
    private static int numberStart(String name) {
        if (name == null) return -1;
        String n = name.trim();
        int start = n.length();
        while (start > 0 && Character.isDigit(n.charAt(start - 1))) start--;
        return start == n.length() ? -1 : start;
    }

    /** Trailing number of a channel name, or -1 when the name does not end in digits. */
    private static int trailingNumber(String name) {
        int start = numberStart(name);
        if (start < 0) return -1;
        try {
            return Integer.parseInt(name.trim().substring(start));
        } catch (NumberFormatException e) {
            return -1;
        }
    }

    /** Shared letter prefix before the trailing number, or null when the names are not one numbered family. */
    private static String sharedPrefix(String a, String b) {
        int aStart = numberStart(a);
        int bStart = numberStart(b);
        if (aStart < 0 || bStart < 0) return null;
        String pa = a.trim().substring(0, aStart).trim().toLowerCase(java.util.Locale.ROOT);
        String pb = b.trim().substring(0, bStart).trim().toLowerCase(java.util.Locale.ROOT);
        if (pa.isEmpty() || !pa.equals(pb)) return null;
        return pa;
    }

    /**
     * Compare two channel names: family rank first; inside one numbered family the
     * numbers list ascending (1 at the top); anything else returns 0 so the caller's
     * own order stands.
     */
    static int compare(String a, String b) {
        int r = Integer.compare(rank(a), rank(b));
        if (r != 0) return r;
        String prefix = sharedPrefix(a, b);
        if (prefix == null) return 0;
        return Integer.compare(trailingNumber(a), trailingNumber(b));
    }
}
