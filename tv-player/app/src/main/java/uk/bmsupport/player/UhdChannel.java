package uk.bmsupport.player;

/** UHD/4K live channels: played full screen in the box's own engine and given longer to ride out short gaps. */
final class UhdChannel {
    private UhdChannel() {}
    /** Channels that open full screen in the box's own engine (Media3) first: UHD/4K and Coupang Play only.
     *  Every other live channel starts in the built-in libVLC backup engine (the original behaviour). */
    static boolean ownEngine(String name, String category) { return is(name) || StreamRecovery.plainLive(name); }
    /** Looped on-demand channels keep the libVLC backup engine first. Matched on the channel name AND its
     *  category, because looped channels are often named without the marker (e.g. "Sky Store Premier 1"
     *  sits in "VIP Sky Store Premier"). Covers the VIP categories (VIP Sky Store Premier, VIP Netflix
     *  Movies, VIP Amazon Prime Series, VIP Kids Corner, VIP Cinema) and the 24/7 ones (24/7 Movies/Series,
     *  24/7 Artists, 24/7 Bollywood), plus box sets. */
    static boolean looped(String name, String category) {
        if (is(name) || StreamRecovery.plainLive(name)) return false;
        String both = ((name == null ? "" : name) + " " + (category == null ? "" : category)).trim();
        if (both.isEmpty()) return false;
        return both.matches("(?i).*(\\bVIP\\b|cinema|24\\s*/\\s*7|24-7|\\b247\\b|box\\s*sets?|boxset|\\bloop).*");
    }
    static boolean is(String name) {
        if (name == null) return false;
        return name.matches("(?i).*(\\bUHD\\b|\\b4K\\b|\\b2160p?\\b).*");
    }
}
