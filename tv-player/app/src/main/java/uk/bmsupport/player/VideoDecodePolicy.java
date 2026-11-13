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
        return catchup || affectedChannel(name);
    }
    static boolean moviePremiere(String name) {
        return name != null && name.toLowerCase(java.util.Locale.ROOT)
                .replaceAll("[^a-z0-9]", "").contains("moviepremiere");
    }
    /** Short picture-format tag for freeze reports, e.g. " avc1.640028 1920x1080@25". */
    static String describe(androidx.media3.common.Format f) {
        if (f == null) return " fmt?";
        return " " + (f.codecs == null ? f.sampleMimeType : f.codecs) + " " + f.width + "x" + f.height
                + (f.frameRate > 0 ? "@" + Math.round(f.frameRate) : "");
    }
    /** H.264 tagged level 5.0 or above (avc1.PPCCLL with LL >= 0x32): decode in low-latency mode. */
    static boolean lowLatencyDecode(String codecs) {
        if (codecs == null) return false;
        for (String c : codecs.split(",")) {
            c = c.trim().toLowerCase(java.util.Locale.ROOT);
            if (!(c.startsWith("avc1.") || c.startsWith("avc3.")) || c.length() < 11) continue;
            try { if (Integer.parseInt(c.substring(9, 11), 16) >= 0x32) return true; } catch (NumberFormatException ignored) { }
        }
        return false;
    }
    /** MediaTek boxes get synchronous decoder feeding (chosen by chip, never by channel). */
    static boolean synchronousFeed(String hardware, String soc) {
        String h = (hardware == null ? "" : hardware) + " " + (soc == null ? "" : soc);
        h = h.toLowerCase(java.util.Locale.ROOT);
        return h.contains("mediatek") || h.matches(".*\\bmt\\d{4}.*") || h.contains(" mtk");
    }
}
