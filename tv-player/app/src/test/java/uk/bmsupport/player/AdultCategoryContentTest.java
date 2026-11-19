package uk.bmsupport.player;

import java.util.Set;
import org.junit.Test;
import static org.junit.Assert.*;

public class AdultCategoryContentTest {
    @Test public void adultCategoryWithNoStreamsIsHidden() {
        Set<String> used = AdultCategoryContent.usedIds("[{\"stream_id\":1,\"category_id\":\"5\"},{\"stream_id\":2,\"category_id\":\"7\",\"category_ids\":[7,9]}]");
        assertTrue(used.contains("5")); assertTrue(used.contains("9"));
        assertTrue(AdultCategoryContent.emptyAdult(true, "17", used));
        assertFalse(AdultCategoryContent.emptyAdult(true, "9", used));
        assertFalse(AdultCategoryContent.emptyAdult(false, "17", used));
        assertFalse("unknown list keeps categories", AdultCategoryContent.emptyAdult(true, "17", null));
    }
}
