package uk.bmsupport.player;

import static org.junit.Assert.*;
import org.junit.Test;

public class LiveNowNextTest {
    private final long[] st = {1000, 2800, 4600};
    private final long[] en = {2800, 4600, 6400};

    @Test public void nowAndNext() { assertArrayEquals(new int[]{0, 1}, LiveNowNext.pick(st, en, 1500)); }
    @Test public void middleProgramme() { assertArrayEquals(new int[]{1, 2}, LiveNowNext.pick(st, en, 3000)); }
    @Test public void lastProgrammeHasNoNext() { assertArrayEquals(new int[]{2, -1}, LiveNowNext.pick(st, en, 5000)); }
    @Test public void beforeFirstShowsItAsNext() { assertArrayEquals(new int[]{-1, 0}, LiveNowNext.pick(st, en, 500)); }
    @Test public void afterEverything() { assertArrayEquals(new int[]{-1, -1}, LiveNowNext.pick(st, en, 9000)); }
    @Test public void empty() { assertArrayEquals(new int[]{-1, -1}, LiveNowNext.pick(new long[0], new long[0], 1)); }
    @Test public void stepWraps() {
        assertEquals(1, LiveNowNext.step(0, 1, 5));
        assertEquals(0, LiveNowNext.step(4, 1, 5));
        assertEquals(4, LiveNowNext.step(0, -1, 5));
    }
}
