package uk.bmsupport.player;

import static org.junit.Assert.*;
import org.junit.Test;

public class VpnStartsOffTest {
    @Test public void appStartSwitchesALeftOnVpnOff() { assertTrue(BoxVpn.startsOff(true, true)); }
    @Test public void customerSwitchingOnLaterIsKept() { assertFalse(BoxVpn.startsOff(false, true)); }
}
