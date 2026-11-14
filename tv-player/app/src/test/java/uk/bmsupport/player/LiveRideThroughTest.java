package uk.bmsupport.player;

import static org.junit.Assert.*;
import org.junit.Test;

public class LiveRideThroughTest {
    @Test public void frozenPictureWithRunningSoundTripsAfterFourSeconds() {
        LiveRideThrough r = new LiveRideThrough();
        r.frozen(100, 50, 0); r.frozen(100, 60, 1000);
        assertFalse(r.frozen(100, 70, 4000));
        assertTrue(r.frozen(100, 80, 5000));
    }
    @Test public void movingPictureNeverTrips() {
        LiveRideThrough r = new LiveRideThrough();
        for (int i = 0; i < 10; i++) assertFalse(r.frozen(100 + i, 50 + i, i * 1000L));
    }
    @Test public void feedPauseWithNoSoundIsNotAFrozenPicture() {
        LiveRideThrough r = new LiveRideThrough();
        for (int i = 0; i < 10; i++) assertFalse(r.frozen(100, 50, i * 1000L));
    }
    @Test public void threeQuietReopensThenGiveUp() {
        LiveRideThrough r = new LiveRideThrough();
        assertTrue(r.allowFreezeReopen()); assertTrue(r.allowFreezeReopen()); assertTrue(r.allowFreezeReopen());
        assertFalse(r.allowFreezeReopen());
    }
    @Test public void retryBudgetRefreshesAfterThirtySecondsSteady() {
        LiveRideThrough r = new LiveRideThrough();
        r.playing(0);
        assertFalse(r.stable(29999));
        assertTrue(r.stable(30000));
        r.stopped();
        assertFalse(r.stable(60000));
    }
    @Test public void audioTrackFoundAgainByNameThenLanguage() {
        int[] ids = {1, 2, 3};
        assertEquals(2, LiveRideThrough.pickAudio(ids, new String[]{"Disable", "English - [Stereo]", "German"}, "English - [Stereo]"));
        assertEquals(2, LiveRideThrough.pickAudio(ids, new String[]{"Disable", "English - [5.1]", "German"}, "English - [Stereo]"));
        assertEquals(-1, LiveRideThrough.pickAudio(ids, new String[]{"Disable", "French"}, "English - [Stereo]"));
    }
}
