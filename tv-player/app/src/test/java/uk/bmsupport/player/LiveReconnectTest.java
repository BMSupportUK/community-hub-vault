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
}
