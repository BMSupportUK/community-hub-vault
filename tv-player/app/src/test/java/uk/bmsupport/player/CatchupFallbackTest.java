package uk.bmsupport.player;

import static org.junit.Assert.*;
import org.junit.Test;

public class CatchupFallbackTest {
    @Test public void vlcPlaybackErrorFallsBack() { assertTrue(CatchupFallback.vlcFailed(3, 60000, 5000)); }
    @Test public void vlcConnectionFailedFallsBack() { assertTrue(CatchupFallback.vlcFailed(2, 60000, 5000)); }
    @Test public void vlcReturningStraightAwayWithNoPictureFallsBack() { assertTrue(CatchupFallback.vlcFailed(-1, 3000, -1)); }
    @Test public void watchedThenBackStaysInApp() { assertFalse(CatchupFallback.vlcFailed(-1, 600000, 300000)); }
    @Test public void quickBackAfterPictureStaysInApp() { assertFalse(CatchupFallback.vlcFailed(-1, 6000, 4000)); }
}
