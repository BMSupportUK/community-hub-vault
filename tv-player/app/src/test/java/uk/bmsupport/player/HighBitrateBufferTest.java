package uk.bmsupport.player;

import static org.junit.Assert.*;
import org.junit.Test;

public class HighBitrateBufferTest {
    @Test public void heavyNamesGetLargeBuffer() {
        assertTrue(StreamRecovery.cushioned("Sky Sports Main Event UHD"));
        assertTrue(StreamRecovery.cushioned("TNT Sports 1 FHD"));
        assertTrue(StreamRecovery.cushioned("Eurosport 4K"));
        assertArrayEquals(new int[]{40000, 90000, 3000, 6000}, StreamRecovery.bufferMs("smooth", "BT Sport 1080p50"));
        assertEquals(30000, StreamRecovery.liveTargetMs("Sky Sports F1 UHD"));
        assertEquals("high_bitrate", StreamRecovery.providerTag("Sky Cinema UHD"));
        assertFalse(StreamRecovery.cushioned("BBC One HD"));
    }
    @Test public void formatThresholds() {
        assertTrue(StreamRecovery.isHeavyFormat(1920, 1080, 50f, 6_000_000));
        assertFalse(StreamRecovery.isHeavyFormat(1920, 1080, 25f, 5_000_000));
        assertTrue(StreamRecovery.isHeavyFormat(3840, 2160, 25f, -1));
        assertTrue(StreamRecovery.isHeavyFormat(1280, 720, 50f, 9_000_000));
    }
    @Test public void measuredChannelIsRemembered() {
        StreamRecovery.HEAVY.clear();
        assertFalse(StreamRecovery.cushioned("ITV1 HD"));
        assertTrue(StreamRecovery.rememberHeavy("ITV1 HD"));
        assertTrue(StreamRecovery.cushioned("ITV1 HD"));
        StreamRecovery.HEAVY.clear();
    }
}
