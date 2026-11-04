package uk.bmsupport.directinstall;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/** The Update app button must only download when the website genuinely has a newer version. */
public class SelfUpdateTest {
    @Test
    public void onlyNewerVersionsTriggerAnUpdate() {
        assertTrue("2.0 replaces 1.9", VersionCompare.newer("2.0", "1.9"));
        assertTrue("2.0.1 replaces 2.0", VersionCompare.newer("2.0.1", "2.0"));
        assertFalse("the same version is not an update", VersionCompare.newer("2.0", "2.0"));
        assertFalse("an older build on the website is never installed", VersionCompare.newer("1.9", "2.0"));
        assertFalse("an empty website answer is not an update", VersionCompare.newer("", "2.0"));
    }
}
