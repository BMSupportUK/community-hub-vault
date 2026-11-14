package uk.bmsupport.player;

import static org.junit.Assert.*;
import org.junit.Test;

public class CatchupStartTest {
    @Test public void defaultIsTwoMinutesIn() {
        assertEquals(2, CatchupStart.DEFAULT_MIN);
        assertEquals(1000 + 120, CatchupStart.at(1000, 1000 + 3600, CatchupStart.DEFAULT_MIN));
    }
    @Test public void exactGuideTimeOpensAtListedStart() {
        assertEquals(1000, CatchupStart.at(1000, 4600, 0));
    }
    @Test public void endGrowsBySameOffset() {
        assertEquals(4600 + 300, CatchupStart.end(4600, 5));
    }
    @Test public void skipsStayInsideProgramme() {
        assertEquals(1200 + 180, CatchupStart.jump(1200 + 125, 1, 1200, 4800));
        assertEquals(1000, CatchupStart.jump(1000 + 30, -1, 1000, 4600));
        assertEquals(4600 - 60, CatchupStart.jump(4590, 1, 1000, 4600));
    }
    @Test public void skipAheadAlwaysMovesForwardNeverBackToListedStart() {
        long listed = 1200, end = 1200 + 3600;
        long first = CatchupStart.skipAhead(listed + 120, listed, end);
        assertEquals(listed + 240, first);
        assertEquals(listed + 360, CatchupStart.skipAhead(first, listed, end));
    }
    @Test public void learnedStartIsMinutesAfterListedCapped() {
        assertEquals(6, CatchupStart.learned(1200 + 360, 1200));
        assertEquals(0, CatchupStart.learned(1100, 1200));
        assertEquals(CatchupStart.MAX_LEARNED_MIN, CatchupStart.learned(1200 + 3600, 1200));
    }
}
