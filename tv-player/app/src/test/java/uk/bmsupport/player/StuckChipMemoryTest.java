package uk.bmsupport.player;

import org.junit.Test;
import java.util.Collections;
import static org.junit.Assert.*;

public class StuckChipMemoryTest {
    @Test public void freezeAfterOnlyTenHardwarePicturesCountsAsJammedChip() {
        assertTrue(StuckChipMemory.chipJammed(true, 10));
        assertFalse(StuckChipMemory.chipJammed(true, 5000));
        assertFalse(StuckChipMemory.chipJammed(false, 10));
    }
    @Test public void rememberedChannelMatchesItsPreviewName() {
        java.util.Set<String> saved = Collections.singleton(StuckChipMemory.key("Movie Premiere ᴴᴰ"));
        assertTrue(StuckChipMemory.matches(saved, "Movie Premiere ᴴᴰ"));
        assertTrue(StuckChipMemory.matches(saved, "Movie Premiere ᴴᴰ VIP Cinema Collection"));
        assertFalse(StuckChipMemory.matches(saved, "BBC One | FHD |"));
        assertFalse(StuckChipMemory.matches(saved, null));
    }
}
