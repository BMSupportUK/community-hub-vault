package uk.bmsupport.player;
/** Reminder eligibility is independent of the currently previewing channel. */
public final class GuideReminder {
    private GuideReminder() {}
    public static boolean eligible(GuideGridView.Prog p, long now) {
        return p != null && p.st > now && !"No Event Scheduled".equalsIgnoreCase(p.title.trim());
    }
}