package uk.bmsupport.player;

import static org.junit.Assert.assertEquals;
import org.junit.Test;

public class BoxVpnTest {
    @Test public void newSetupSwitchesOn() { assertEquals(BoxVpn.Step.UP, BoxVpn.decide(true, true, "[Interface]a", null)); }
    @Test public void sameSetupIsLeftRunning() { assertEquals(BoxVpn.Step.NONE, BoxVpn.decide(true, true, "x", "x")); }
    @Test public void changedServerReconnects() { assertEquals(BoxVpn.Step.UP, BoxVpn.decide(true, true, "y", "x")); }
    @Test public void turnedOffOnWebsiteSwitchesOff() { assertEquals(BoxVpn.Step.DOWN, BoxVpn.decide(true, false, null, "x")); }
    @Test public void nothingSentNothingRunning() { assertEquals(BoxVpn.Step.NONE, BoxVpn.decide(false, false, null, null)); }
    @Test public void toggleShowsOnOffAndConnecting() {
        assertEquals("🔒 VPN: On", BoxVpn.toggleLabel(true, true));
        assertEquals("🔒 VPN: Connecting", BoxVpn.toggleLabel(true, false));
        assertEquals("🔓 VPN: Off", BoxVpn.toggleLabel(false, false));
    }
}
