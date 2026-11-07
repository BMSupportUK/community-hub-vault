package uk.bmsupport.player;

/** Keep damaged MonoMax frames off device hardware decoders without changing UHD defaults. */
final class VideoDecodePolicy {
    static boolean affectedChannel(String name) {
        return name != null && name.toLowerCase(java.util.Locale.ROOT).replaceAll("[^a-z0-9]", "").contains("monomax");
    }
    static boolean preferSoftware(boolean catchup, String decoder, String name) {
        return catchup || "software".equals(decoder) || affectedChannel(name);
    }
    static boolean cleanKeyframes(boolean catchup, String name) {
        return catchup || affectedChannel(name);
    }
}