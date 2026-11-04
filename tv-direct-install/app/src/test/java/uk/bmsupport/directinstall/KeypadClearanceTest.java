package uk.bmsupport.directinstall;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

/** The PIN and website-code screens must lift themselves above the on-screen keypad. */
public class KeypadClearanceTest {
    @Test
    public void edgeToEdgeScreensLiftByTheKeypadHeight() {
        assertEquals("a 700px keypad lifts the screen 700px", 700, KeypadLift.lift(700, 48));
        assertEquals("with the keypad closed only the nav bar is cleared", 48, KeypadLift.lift(0, 48));
        assertEquals(0, KeypadLift.lift(0, 0));
    }
}
