package uk.bmsupport.player;

/** UHD/4K live channels: played full screen in the box's own engine and given longer to ride out short gaps. */
final class UhdChannel {
    private UhdChannel() {}
    /** Channels that open full screen in the box's own engine (Media3) first, like other IPTV apps: UHD/4K and Coupang Play. */
    static boolean ownEngine(String name) { return !looped(name); }
    /** Looped on-demand channels (VIP Cinema, 24/7, box sets) keep the libVLC backup engine first. */
    static boolean looped(String name) {
        if (name == null || is(name) || StreamRecovery.plainLive(name)) return false;
        return name.matches("(?i).*(\\bVIP\\b|cinema|24\\s*/\\s*7|24-7|\\b247\\b|box\\s*sets?|boxset|\\bloop).*");
    }
    static boolean is(String name) {
        if (name == null) return false;
        return name.matches("(?i).*(\\bUHD\\b|\\b4K\\b|\\b2160p?\\b).*");
    }
}
