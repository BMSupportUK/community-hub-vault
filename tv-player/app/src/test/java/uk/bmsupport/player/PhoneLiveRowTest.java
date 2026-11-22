package uk.bmsupport.player;

import java.util.Arrays;
import org.junit.Test;
import static org.junit.Assert.*;

public class PhoneLiveRowTest {
    @Test public void picksNowAndNext() {
        GuideGridView.Prog a = new GuideGridView.Prog("News", 100, 200), b = new GuideGridView.Prog("Film", 200, 300);
        GuideGridView.Prog[] nn = PhoneLiveRow.nowNext(Arrays.asList(a, b), 150);
        assertSame(a, nn[0]); assertSame(b, nn[1]);
    }
    @Test public void percentThroughNow() {
        assertEquals(50, PhoneLiveRow.percent(new GuideGridView.Prog("x", 100, 200), 150));
        assertEquals(-1, PhoneLiveRow.percent(new GuideGridView.Prog("x", 100, 200), 250));
    }
    @Test public void noListingsGivesNothing() {
        GuideGridView.Prog[] nn = PhoneLiveRow.nowNext(null, 1);
        assertNull(nn[0]); assertNull(nn[1]);
    }
}
