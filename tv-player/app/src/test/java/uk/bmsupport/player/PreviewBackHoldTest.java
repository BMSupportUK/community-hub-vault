package uk.bmsupport.player;
import org.junit.Test;
import static org.junit.Assert.*;
public class PreviewBackHoldTest {
    @Test public void holdActivatesOnlyOnceAndReleaseDoesNotNavigateBack() {
        PreviewBackHold h = new PreviewBackHold(); h.down(1000);
        assertFalse(h.hold(1649)); assertTrue(h.hold(1650));
        assertFalse(h.hold(2000)); assertFalse(h.up(false));
    }
    @Test public void shortBackStillNavigatesAndCancellationDoesNothing() {
        PreviewBackHold h = new PreviewBackHold(); h.down(1000);
        assertTrue(h.up(false)); h.down(2000); assertFalse(h.up(true));
        assertFalse(h.hold(3000));
    }
}