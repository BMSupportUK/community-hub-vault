package uk.bmsupport.player;

/**
 * Puts the Womens Football channels above the FA Player ones inside their shared
 * Live TV category. Every other channel keeps its existing order.
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

    /** Compare two channel names by rank only; equal ranks return 0 so the caller's own order stands. */
    static int compare(String a, String b) {
        return Integer.compare(rank(a), rank(b));
    }
}
