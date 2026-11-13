package uk.bmsupport.player;

/** Affected feeds wait for clean keyframes, without forcing slow software decoding. */
final class VideoDecodePolicy {
    static boolean affectedChannel(String name) {
        return name != null && name.toLowerCase(java.util.Locale.ROOT).replaceAll("[^a-z0-9]", "").contains("monomax");
    }
    static boolean preferSoftware(boolean catchup, String decoder, String name) {
        return catchup || "software".equals(decoder);
    }
    static boolean cleanKeyframes(boolean catchup, String name) {
        return catchup || affectedChannel(name) || moviePremiere(name);
    }
    static boolean moviePremiere(String name) {
        return name != null && name.toLowerCase(java.util.Locale.ROOT)
                .replaceAll("[^a-z0-9]", "").contains("moviepremiere");
    }
}