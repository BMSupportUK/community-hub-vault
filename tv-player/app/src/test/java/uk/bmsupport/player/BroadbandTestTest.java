package uk.bmsupport.player;
import org.junit.Test;
import java.util.concurrent.atomic.AtomicLong;
import static org.junit.Assert.*;
public class BroadbandTestTest {
    @Test public void actualBytesAndTimeGiveOneHundredMbps() { assertEquals(100000, BroadbandTest.rate(12_500_000, 1_000_000_000)); }
    @Test public void warmupBytesAreIgnored() {
        // 5 MB during warm-up, then 12.5 MB over the next second = 100 Mbps.
        assertEquals(100000, BroadbandTest.steadyRate(5_000_000, 2_000_000_000L, 17_500_000, 3_000_000_000L, 0));
    }
    @Test public void slowLineUsesWholeRunWhenSteadyPartTooSmall() {
        assertEquals(400, BroadbandTest.steadyRate(450_000, 2_000_000_000L, 500_000, 10_000_000_000L, 0));
    }
    @Test public void almostNothingMovedIsNoResult() {
        assertEquals(-1, BroadbandTest.steadyRate(0, 2_000_000_000L, 10_000, 10_000_000_000L, 0));
    }
    @Test public void droppedConnectionsKeepTestGoing() throws Exception {
        AtomicLong calls = new AtomicLong();
        int r = BroadbandTest.timed((c, stop) -> {
            if (calls.incrementAndGet() % 2 == 0) throw new java.io.IOException("dropped");
            while (!stop.getAsBoolean()) { c.addAndGet(50_000); Thread.sleep(5); }
        }, 4, 600_000_000L, 100_000_000L, System::nanoTime);
        assertTrue("got " + r, r > 0);
    }
    @Test public void deadServerGivesNoResult() throws Exception {
        int r = BroadbandTest.timed((c, stop) -> { throw new java.io.IOException("down"); }, 2, 300_000_000L, 100_000_000L, System::nanoTime);
        assertEquals(-1, r);
    }
}
