package uk.bmsupport.player;

/** A frozen decoder must be released, not repeatedly sought on the same instance. */
final class LiveFreezeRecovery {
    static final int MAX_RESTARTS = 3;
    static boolean useBackup(int completedRestarts) { return completedRestarts >= MAX_RESTARTS; }
}