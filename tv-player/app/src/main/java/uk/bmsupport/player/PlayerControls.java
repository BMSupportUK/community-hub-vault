package uk.bmsupport.player;

/** Which player controls each kind of playback gets. */
final class PlayerControls {
    private PlayerControls() {}
    /** Fast forward and rewind only on films and series episodes; live TV and catch up don't get them. */
    static boolean canSkip(String kind) { return "film".equals(kind) || "episode".equals(kind); }
    /** No Report a problem on catch up: those recordings come from the provider and we can't fix them. */
    static boolean canReport(String kind) { return !"catchup".equals(kind); }
}
