package uk.bmsupport.player;

import static org.junit.Assert.*;
import org.junit.Test;

public class LiveReconnectTest {
    @Test public void keepsRetryingForTwoMinutesThenGivesUp() {
        LiveReconnect r = new LiveReconnect();
        assertEquals(1000, r.failed(0));
        assertEquals(2000, r.failed(1000));
        assertTrue(r.failed(119000) > 0);
        assertEquals(-1, r.failed(120000));
    }
    @Test public void gapsCapAtTenSeconds() {
        LiveReconnect r = new LiveReconnect();
        long last = 0; for (int i = 0; i < 10; i++) last = r.failed(i);
        assertEquals(10000, last);
    }
    @Test public void playingAgainResetsTheWindow() {
        LiveReconnect r = new LiveReconnect();
        r.failed(0); r.recovered();
        assertFalse(r.active());
        assertEquals(1000, r.failed(500000));
    }
    @Test public void serverStoppingSendingIsADrop() {
        LiveReconnect r = new LiveReconnect();
        r.opened(0);
        assertFalse(r.noData(100, 1000));
        assertFalse(r.noData(500, 2000));
        assertFalse(r.noData(500, 21999));
        assertTrue(r.noData(500, 22000));
    }
    @Test public void bytesStillArrivingIsNotADrop() {
        LiveReconnect r = new LiveReconnect();
        r.opened(0);
        for (int i = 1; i <= 20; i++) assertFalse(r.noData(i * 1000L, i * 1000L));
    }
    @Test public void soundStoppingWhilePictureContinuesIsADrop() {
        LiveReconnect r = new LiveReconnect();
        r.opened(0);
        assertFalse(r.soundLost(10, 100, 0));
        assertFalse(r.soundLost(20, 200, 1000));
        assertFalse(r.soundLost(100, 200, 5999));
        assertTrue(r.soundLost(110, 200, 6000));
    }
    @Test public void channelWithoutSoundIsNotReopened() {
        LiveReconnect r = new LiveReconnect();
        r.opened(0);
        for (int i = 0; i <= 20; i++) assertFalse(r.soundLost(i * 10L, 0, i * 1000L));
    }
    @Test public void silentFromStartWithAudioTrackIsReopened() {
        LiveReconnect r = new LiveReconnect();
        r.opened(0);
        assertFalse(r.soundLost(10, 0, 0, true));
        assertFalse(r.soundLost(50, 0, 4999, true));
        assertTrue(r.soundLost(60, 0, 5000, true));
    }
    @Test public void soundReopensStopAfterThree() {
        LiveReconnect r = new LiveReconnect();
        int hits = 0;
        for (int i = 0; i <= 60; i++) if (r.soundLost(i * 10L, 0, i * 1000L, true)) hits++;
        assertEquals(3, hits);
    }
}
