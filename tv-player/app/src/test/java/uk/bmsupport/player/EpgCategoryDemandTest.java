package uk.bmsupport.player;
import org.junit.Test;
import static org.junit.Assert.*;
public class EpgCategoryDemandTest {
    @Test public void realCountriesSendSeparateDemand() {
        assertTrue(EpgCategoryDemand.eligible("UK | Entertainment"));
        assertTrue(EpgCategoryDemand.eligible("US | ABC Locals"));
    }
    @Test public void syntheticCategoriesNeverFanOut() {
        assertFalse(EpgCategoryDemand.eligible("All"));
        assertFalse(EpgCategoryDemand.eligible("Favourites"));
        assertFalse(EpgCategoryDemand.eligible("*"));
        assertFalse(EpgCategoryDemand.eligible(null));
    }
}