package uk.bmsupport.player;

/** UHD/4K live channels: played full screen in the box's own engine and given longer to ride out short gaps. */
final class UhdChannel {
    private UhdChannel() {}
    static boolean is(String name) {
        if (name == null) return false;
        return name.matches("(?i).*(\\bUHD\\b|\\b4K\\b|\\b2160p?\\b).*");
    }
}
