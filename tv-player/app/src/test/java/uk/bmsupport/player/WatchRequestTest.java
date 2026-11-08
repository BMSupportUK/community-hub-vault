package uk.bmsupport.player;

import static org.junit.Assert.*;
import org.junit.Test;
import java.util.Arrays;

public class WatchRequestTest {
    private static MainActivity.Item it(String id, String name) { return new MainActivity.Item("film", id, name, "mp4", "1"); }
    @Test public void providerIdWins() {
        assertEquals("2", WatchRequest.find(Arrays.asList(it("1", "Dune (2024)"), it("2", "Other")), "2", "Dune").id);
    }
    @Test public void fallsBackToExactTitleIgnoringYear() {
        assertEquals("1", WatchRequest.find(Arrays.asList(it("1", "Dune (2024)")), null, "Dune").id);
        assertNull(WatchRequest.find(Arrays.asList(it("1", "Dune Part Two")), null, "Dune"));
    }
}
