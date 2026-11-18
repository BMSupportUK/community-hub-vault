package uk.bmsupport.player;

import static org.junit.Assert.assertEquals;
import org.junit.Test;

public class VpnHomeLabelTest {
    @Test public void connectedShowsLocation() { assertEquals("On · London #3 (GB)", BoxVpn.homeLabel("On", true, "London #3 (GB)")); }
    @Test public void offOrConnectingShowsNoLocation() {
        assertEquals("Off", BoxVpn.homeLabel("Off", false, "London #3 (GB)"));
        assertEquals("Connecting", BoxVpn.homeLabel("Connecting", false, "London #3 (GB)"));
        assertEquals("On", BoxVpn.homeLabel("On", true, ""));
    }
}
