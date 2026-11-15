package uk.bmsupport.player;
import org.junit.Test;
import static org.junit.Assert.*;
public class BroadbandTestTest {
    @Test public void actualBytesAndTimeGiveOneHundredMbps() { assertEquals(100000, BroadbandTest.rate(12_500_000, 1_000_000_000)); }
    @Test public void fastSamplesGrowUntilSustainedAndUseMedian() throws Exception {
        java.util.List<Integer> sizes = new java.util.ArrayList<>();
        int result = BroadbandTest.measure(false, (upload, bytes) -> { sizes.add(bytes); return new BroadbandTest.Sample(bytes, bytes * 80L); });
        assertEquals(100000, result); assertEquals(12, sizes.size()); assertEquals(Integer.valueOf(50_000_000), sizes.get(11));
    }
    @Test(expected = java.io.IOException.class) public void partialDownloadIsNotASpeedResult() throws Exception {
        BroadbandTest.measure(false, (upload, bytes) -> new BroadbandTest.Sample(bytes - 1, 1_000_000_000));
    }
    @Test public void slowLineStillGivesReadingFromTimeCappedSample() throws Exception {
        int r = BroadbandTest.measure(true, (u, b) -> new BroadbandTest.Sample(1_000_000, 8_000_000_000L, true));
        assertEquals(1000, r);
    }
    @Test public void oneFailedSampleDoesNotVoidTest() throws Exception {
        int[] n = {0};
        int r = BroadbandTest.measure(false, (u, b) -> { if (n[0]++ == 0) throw new java.io.IOException("x"); return new BroadbandTest.Sample(b, b * 80L); });
        assertEquals(100000, r);
    }
    @Test public void twoSecondSamplesAreNotLongEnoughToStopGrowing() throws Exception {
        java.util.List<Integer> sizes = new java.util.ArrayList<>();
        BroadbandTest.measure(false, (u, b) -> { sizes.add(b); return new BroadbandTest.Sample(b, 2_000_000_000L); });
        assertEquals(12, sizes.size());
    }
    @Test public void threeSecondSamplesMeetTheSustainedTarget() throws Exception {
        int[] calls = {0};
        BroadbandTest.measure(false, (u, b) -> { calls[0]++; return new BroadbandTest.Sample(b, 3_000_000_000L); });
        assertEquals(3, calls[0]);
    }
}
