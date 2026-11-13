package uk.bmsupport.player;

import org.junit.Test;
import static org.junit.Assert.*;

public class MultiScreenRecoveryTest {
    @Test public void blackSecondPaneRestartsAndReopensOnlyItsChannel() {
        int[] opens = {0, 0};
        MultiScreenRecovery left = new MultiScreenRecovery(() -> opens[0]++, () -> fail());
        MultiScreenRecovery right = new MultiScreenRecovery(() -> opens[1]++, () -> fail());
        left.sample(0, true, 1); right.sample(0, true, 0);
        right.sample(9999, true, 0); assertEquals(0, opens[1]);
        left.sample(10000, true, 500); right.sample(10000, true, 0);
        assertArrayEquals(new int[]{0, 1}, opens);
        right.sample(11000, true, 1); right.sample(20000, true, 400);
        assertEquals(1, opens[1]);
    }

    @Test public void missingDecoderCountersStillRecoverBlackPicture() {
        int[] restarts = {0};
        MultiScreenRecovery recovery = new MultiScreenRecovery(() -> restarts[0]++, () -> fail());
        recovery.sample(0, true, -1); recovery.sample(10000, true, -1);
        assertEquals(1, restarts[0]);
    }

    @Test public void bufferingDoesNotResetVideoChip() {
        int[] restarts = {0};
        MultiScreenRecovery recovery = new MultiScreenRecovery(() -> restarts[0]++, () -> fail());
        recovery.sample(0, true, 0); recovery.sample(9000, false, 0);
        recovery.sample(60000, false, 0); recovery.sample(61000, true, 0);
        recovery.sample(70999, true, 0); assertEquals(0, restarts[0]);
        recovery.sample(71000, true, 0); assertEquals(1, restarts[0]);
    }

    @Test public void renderedPictureFreezingRestartsAfterFourSeconds() {
        int[] restarts = {0};
        MultiScreenRecovery recovery = new MultiScreenRecovery(() -> restarts[0]++, () -> fail());
        recovery.sample(0, true, 40); recovery.sample(3999, true, 40);
        assertEquals(0, restarts[0]); recovery.sample(4000, true, 40);
        assertEquals(1, restarts[0]);
    }

    @Test public void retriesStopAfterThreeAndChannelChangeGetsNewBudget() {
        int[] calls = {0, 0};
        MultiScreenRecovery recovery = new MultiScreenRecovery(() -> calls[0]++, () -> calls[1]++);
        for (int i = 0; i < 6; i++) {
            recovery.sample(i * 11000L, true, 0);
            recovery.sample(i * 11000L + 10000, true, 0);
        }
        assertArrayEquals(new int[]{3, 1}, calls);
        recovery = new MultiScreenRecovery(() -> calls[0]++, () -> calls[1]++);
        recovery.sample(0, true, 0); recovery.sample(10000, true, 0);
        assertArrayEquals(new int[]{4, 1}, calls);
    }
}