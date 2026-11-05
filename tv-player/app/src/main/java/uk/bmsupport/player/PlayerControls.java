package uk.bmsupport.player;

/** Which player controls each kind of playback gets. */
final class PlayerControls {
    private PlayerControls() {}
    /** Fast forward and rewind only on films and series episodes; live TV and catch up don't get them. */
    static boolean canSkip(String kind) { return "film".equals(kind) || "episode".equals(kind); }
    /** No Report a problem on catch up: those recordings come from the provider and we can't fix them. */
    static boolean canReport(String kind) { return !"catchup".equals(kind); }
    /** Picture size: Fit keeps the film's own shape (bars on wide films), Zoom fills the screen and trims the edges, Stretch fills it by stretching. */
    static final String[] PICTURE_IDS = {"fit", "zoom", "stretch"};
    static final String[] PICTURE_LABELS = {"Fit", "Zoom (fill screen)", "Stretch"};
    static String nextPicture(String id) { for (int i = 0; i < PICTURE_IDS.length; i++) if (PICTURE_IDS[i].equals(id)) return PICTURE_IDS[(i + 1) % PICTURE_IDS.length]; return "zoom"; }
    static String pictureLabel(String id) { for (int i = 0; i < PICTURE_IDS.length; i++) if (PICTURE_IDS[i].equals(id)) return PICTURE_LABELS[i]; return PICTURE_LABELS[0]; }
}
