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
}
