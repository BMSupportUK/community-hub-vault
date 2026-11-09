package uk.bmsupport.player;

/** Keeps server addresses, ports and logins out of anything shown on screen. Full details only go into staff reports. */
public final class SafeError {
    private SafeError() {}

    public static final String PLAYBACK = "This channel isn't working right now. Try again, pick another channel, or use Report a problem.";

    /** True when the text carries a web address, IP, host:port or an Xtream login path. */
    public static boolean leaks(String s) {
        if (s == null) return false;
        return s.matches("(?is).*([a-z][a-z0-9+.-]*://|\\b\\d{1,3}(\\.\\d{1,3}){3}\\b|\\[[0-9a-f:]+\\]|\\b[a-z0-9-]+(\\.[a-z0-9-]+)+:\\d{2,5}\\b|/(live|movie|series|timeshift)/[^/\\s]+/[^/\\s]+).*");
    }

    /** Text safe for the screen: the original if harmless, otherwise the fallback. */
    public static String forScreen(String s, String fallback) {
        if (s == null || s.trim().isEmpty() || leaks(s)) return fallback;
        return s;
    }

    public static String forScreen(String s) { return forScreen(s, PLAYBACK); }
}
