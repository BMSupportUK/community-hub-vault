package uk.bmsupport.player;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import org.junit.Test;

public final class BackupFeedStatusTest {
    @Test public void bufferingWhilePictureProgressesNeverShowsAStall() {
        BackupFeedStatus status = new BackupFeedStatus();
        status.reset(0); status.playing(0); status.buffering(25);
        status.progress(1000, 1000); status.progress(2000, 2000);
        assertFalse(status.stalled(true, true, 2500));
    }

    @Test public void completedBufferClearsWithoutAnotherPlayingEvent() {
        BackupFeedStatus status = new BackupFeedStatus();
        status.reset(0); status.playing(0); status.buffering(20);
        assertTrue(status.stalled(true, true, 2000));
        status.buffering(100);
        assertFalse(status.stalled(true, true, 3000));
    }

    @Test public void resumedProgressClearsTheStallImmediately() {
        BackupFeedStatus status = new BackupFeedStatus();
        status.reset(0); status.playing(0); status.buffering(20);
        assertTrue(status.stalled(true, true, 2000));
        status.progress(3000, 2100);
        assertFalse(status.stalled(true, true, 2100));
    }

    @Test public void startupPauseAndReopenNeverInheritAStall() {
        BackupFeedStatus status = new BackupFeedStatus();
        status.reset(0); status.buffering(10);
        assertFalse(status.stalled(false, true, 4000));
        assertFalse(status.stalled(true, false, 4000));
        status.reset(4000);
        assertFalse(status.stalled(true, true, 6000));
    }
}