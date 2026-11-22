package uk.bmsupport.player;

import static org.junit.Assert.assertEquals;
import java.util.HashMap;
import java.util.Map;
import org.junit.Test;

public class CategoryOrderHubTest {
    @Test public void hubBroadcasterCategoriesTakeTheSavedHubPlace() {
        Map<String, Integer> rank = new HashMap<>();
        rank.put("9", 0); rank.put("5", 1);
        assertEquals(0, CategoryOrder.rankOf(rank, "9~stan"));
        assertEquals(0, CategoryOrder.rankOf(rank, "9~coupang"));
        assertEquals(1, CategoryOrder.rankOf(rank, "5"));
        assertEquals(Integer.MAX_VALUE, CategoryOrder.rankOf(rank, "7"));
    }
}
