package uk.bmsupport.player;

/** MonoMax starts on clean keyframes but keeps the hardware decoder (software decoding lagged 1080p50 on boxes). */
final class VideoDecodePolicy {
    static boolean affectedChannel(String name) {
        return name != null && name.toLowerCase(java.util.Locale.ROOT).replaceAll("[^a-z0-9]", "").contains("monomax");
    }
    static boolean preferSoftware(boolean catchup, String decoder, String name) {
        return catchup || "software".equals(decoder);
    }
    static boolean cleanKeyframes(boolean catchup, String name) {
        return catchup || affectedChannel(name);
    }
}