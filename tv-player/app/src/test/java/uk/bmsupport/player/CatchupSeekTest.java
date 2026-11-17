package uk.bmsupport.player;
import org.junit.Test;
import static org.junit.Assert.*;
public class CatchupSeekTest {
    @Test public void pressesStack() { CatchupSeek s = new CatchupSeek(); s.press(1); s.press(1); assertEquals(3, s.press(1)); assertEquals(3, s.take()); assertEquals(0, s.pending()); }
    @Test public void backCancelsForward() { CatchupSeek s = new CatchupSeek(); s.press(1); assertEquals(0, s.press(-1)); }
    @Test public void neverBeforeListedStart() { assertEquals(1000L * 60, CatchupStart.jump(1000L * 60 + 30, -5, 1000L * 60, 2000L * 60)); }
    @Test public void stackedJumpLandsMinutesLater() { assertEquals(1010L * 60, CatchupStart.jump(1007L * 60, 3, 1000L * 60, 2000L * 60)); }
}
