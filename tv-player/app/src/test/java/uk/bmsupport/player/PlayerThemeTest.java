package uk.bmsupport.player;

import static org.junit.Assert.*;
import org.junit.Test;

public class PlayerThemeTest {
    @Test public void themeColourOnlyAcceptsPlainHex() {
        assertEquals(0xFFE11D2E, PlayerTheme.parseAccent("#E11D2E", 1));
        assertEquals(1, PlayerTheme.parseAccent("red", 1));
        assertEquals(1, PlayerTheme.parseAccent("", 1));
    }
    @Test public void shadingDefaultsToMediumAndStrongIsDarker() {
        assertArrayEquals(PlayerTheme.shading("medium"), PlayerTheme.shading("nonsense"));
        assertTrue((PlayerTheme.shading("strong")[1] >>> 24) > (PlayerTheme.shading("light")[1] >>> 24));
        assertEquals("Medium", PlayerTheme.shadeLabel("x"));
    }
}
