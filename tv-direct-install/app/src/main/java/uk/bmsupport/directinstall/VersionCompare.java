package uk.bmsupport.directinstall;

/** Compares dotted version names ("2.0" vs "1.9") without touching Android classes, so it is unit-testable. */
public final class VersionCompare {
    private VersionCompare() {}

    private static int[] parts(String v) {
        String[] s = v.replaceAll("[^0-9.]", "").split("\\.");
        int[] o = new int[4];
        for (int i = 0; i < Math.min(4, s.length); i++) try { o[i] = Integer.parseInt(s[i]); } catch (Exception ignored) {}
        return o;
    }

    /** True only when the website's version is genuinely newer than the one on this device. */
    public static boolean newer(String latest, String current) {
        int[] a = parts(latest), b = parts(current);
        for (int i = 0; i < 4; i++) if (a[i] != b[i]) return a[i] > b[i];
        return false;
    }
}
