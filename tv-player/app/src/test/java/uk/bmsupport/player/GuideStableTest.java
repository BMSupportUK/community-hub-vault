package uk.bmsupport.player;
import static org.junit.Assert.*;
import java.util.Arrays;
import org.junit.Test;
public class GuideStableTest {
    @Test public void identicalRefreshDoesNotCountAsChange() {
        assertTrue(GuideGridView.sameProgs(Arrays.asList(new GuideGridView.Prog("News", 0, 300)), Arrays.asList(new GuideGridView.Prog("News", 0, 300))));
        assertFalse(GuideGridView.sameProgs(Arrays.asList(new GuideGridView.Prog("News", 0, 300)), Arrays.asList(new GuideGridView.Prog("News", 0, 600))));
    }
}
