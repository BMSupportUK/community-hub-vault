package uk.bmsupport.player;

import static org.junit.Assert.*;
import org.junit.Test;

public class StreamProtectTest {
    @Test public void threeFailuresInTwoMinutesSwitchToBackup() {
        LiveReconnect r = new LiveReconnect();
        assertFalse(r.wantsBackup(0));
        assertFalse(r.wantsBackup(30000));
        assertTrue(r.wantsBackup(60000));
    }
    @Test public void spreadOutFailuresDoNotSwitch() {
        LiveReconnect r = new LiveReconnect();
        r.wantsBackup(0); r.wantsBackup(100000);
        assertFalse(r.wantsBackup(230000));
    }
    @Test public void tenSecondsOfDamagedPicturesReopens() {
        LiveReconnect r = new LiveReconnect(); r.opened(0);
        r.blocky(0, 0);
        assertFalse(r.blocky(5, 1000));
        assertFalse(r.blocky(9, 9000));
        assertTrue(r.blocky(14, 11000));
    }
    @Test public void briefGlitchDoesNotReopen() {
        LiveReconnect r = new LiveReconnect(); r.opened(0);
        r.blocky(0, 0); r.blocky(5, 1000); r.blocky(5, 2000);
        assertFalse(r.blocky(6, 12000));
    }
    @Test public void streamUrlHostSwappedForIp() {
        assertEquals("http://1.2.3.4:8080/live/a/b/1.ts", StreamDns.withIp("http://srv.example.com:8080/live/a/b/1.ts", "1.2.3.4"));
        assertEquals("http://x.com/a", StreamDns.withIp("http://x.com/a", null));
    }
}
