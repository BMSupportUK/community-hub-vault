package uk.bmsupport.player;

/** UHD/4K live channels: played full screen in the box's own engine and given longer to ride out short gaps. */
final class UhdChannel {
    private UhdChannel() {}
    /** Channels that open full screen in the box's own engine (Media3) first, like other IPTV apps: UHD/4K and Coupang Play. */
    static boolean ownEngine(String name) { return is(name) || StreamRecovery.plainLive(name); }
    static boolean is(String name) {
        if (name == null) return false;
        return name.matches("(?i).*(\\bUHD\\b|\\b4K\\b|\\b2160p?\\b).*");
    }
}
