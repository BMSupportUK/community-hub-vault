package uk.bmsupport.player;

import static org.junit.Assert.assertEquals;
import org.junit.After;
import org.junit.Test;

public class CheckinTest {
    @After public void clear() { Checkin.reset(); }
    @Test public void jitterStaysWithinTwentyPercent() {
        assertEquals(48000, Checkin.jitter(60000, 0));
        assertEquals(72000, Checkin.jitter(60000, 1));
    }
    @Test public void backoffDoublesAndCapsAtFiveMinutes() {
        assertEquals(120000, Checkin.backoff(1, 60000, 0.5));
        assertEquals(300000, Checkin.backoff(8, 60000, 0.5));
    }
    @Test public void slowdownScalesAndSuccessResets() {
        Checkin.setSlow(3); assertEquals(180000, Checkin.delay(60000, 0.5));
        Checkin.setSlow(1); Checkin.fail(0); assertEquals(120000, Checkin.delay(60000, 0.5));
        Checkin.ok(); assertEquals(60000, Checkin.delay(60000, 0.5));
    }
    @Test public void retryAfterParsed() {
        assertEquals(30000, Checkin.retryAfterMs("30"));
        assertEquals(0, Checkin.retryAfterMs(null));
    }
}
