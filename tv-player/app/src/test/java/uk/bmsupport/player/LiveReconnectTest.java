package uk.bmsupport.player;

import static org.junit.Assert.*;
import org.junit.Test;

public class LiveReconnectTest {
    @Test public void keepsRetryingForTwoMinutesThenGivesUp() {
        LiveReconnect r = new LiveReconnect();
        assertEquals(0, r.failed(0));
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
        assertEquals(0, r.failed(500000));
    }
    @Test public void serverStoppingSendingIsADrop() {
        LiveReconnect r = new LiveReconnect();
        r.opened(0);
        assertFalse(r.noData(100, 1000));
        assertFalse(r.noData(500, 2000));
        assertFalse(r.noData(500, 4999));
        assertTrue(r.noData(500, 5000));
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
        assertFalse(r.soundLost(100, 200, 8000));
        assertTrue(r.soundLost(110, 200, 9000));
    }
    @Test public void channelWithoutSoundIsNotReopened() {
        LiveReconnect r = new LiveReconnect();
        r.opened(0);
        for (int i = 0; i <= 20; i++) assertFalse(r.soundLost(i * 10L, 0, i * 1000L));
    }
}
