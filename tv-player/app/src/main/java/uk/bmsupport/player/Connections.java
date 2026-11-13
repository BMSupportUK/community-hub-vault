package uk.bmsupport.player;

/**
 * Provider connection counts. Packages are Single 1, Multi Room 2, Triple Room 3; some provider
 * lines report a huge placeholder (e.g. 315368056) for "unlimited", which must never unlock Multi-screen.
 */
final class Connections {
    static final int MAX = 3;
    private Connections() {}
    /** The provider's number when it is a real package size (1-3), otherwise 0 (unknown: use the website package). */
    static int real(String raw) {
        try { double d = Double.parseDouble(raw == null ? "" : raw.trim()); return d >= 1 && d <= MAX ? (int) d : 0; }
        catch (Exception e) { return 0; }
    }
    /** For display: the real number, or "1" when the provider's number is nonsense. */
    static String label(String raw) { int n = real(raw); return n >= 1 ? String.valueOf(n) : "1"; }
}
