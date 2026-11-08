package uk.bmsupport.player;

import static org.junit.Assert.assertEquals;
import org.junit.Test;

public final class BackupStallTrackerTest {
    @Test public void measuresOnceIncludingDetectionDelay() {
        BackupStallTracker tracker = new BackupStallTracker();
        assertEquals(0, tracker.update(true, 5000));
        assertEquals(0, tracker.update(true, 6000));
        assertEquals(4000, tracker.update(false, 7000));
        assertEquals(0, tracker.update(false, 8000));
    }
    @Test public void startupAndPauseDoNotCreateMeasurements() {
        BackupStallTracker tracker = new BackupStallTracker();
        assertEquals(0, tracker.update(false, 9000));
        assertEquals(0, tracker.finish(10000));
    }
    @Test public void exitFinishesPendingStallOnce() {
        BackupStallTracker tracker = new BackupStallTracker();
        tracker.update(true, 5000);
        assertEquals(3000, tracker.finish(6000));
        assertEquals(0, tracker.finish(7000));
    }
}