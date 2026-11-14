package uk.bmsupport.player;
import org.junit.Test;
import static org.junit.Assert.*;
public class BroadbandTestTest {
    @Test public void actualBytesAndTimeGiveOneHundredMbps() { assertEquals(100000, BroadbandTest.rate(12_500_000, 1_000_000_000)); }
    @Test public void fastSamplesGrowUntilSustainedAndUseMedian() throws Exception {
        java.util.List<Integer> sizes = new java.util.ArrayList<>();
        int result = BroadbandTest.measure(false, (upload, bytes) -> { sizes.add(bytes); return new BroadbandTest.Sample(bytes, bytes * 80L); });
        assertEquals(100000, result); assertEquals(9, sizes.size()); assertEquals(Integer.valueOf(20_000_000), sizes.get(8));
    }
    @Test(expected = java.io.IOException.class) public void partialDownloadIsNotASpeedResult() throws Exception {
        BroadbandTest.measure(false, (upload, bytes) -> new BroadbandTest.Sample(bytes - 1, 1_000_000_000));
    }
}